import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaService } from "../../database/prisma.service";

const deriveKey = (password: string, salt: Buffer, length: number) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, { N: PASSWORD_COST, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result as Buffer));
});
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_TTL_MS = 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_COST = 1 << 17;
const hex = (value: string) => createHash("sha256").update(value).digest("hex");
const opaqueToken = () => randomBytes(32).toString("base64url");

export type ProfileInput = {
  professionalName?: string | null;
  profession?: string | null;
  specialty?: string | null;
  city?: string | null;
  region?: string | null;
  serviceMode?: string | null;
  targetAudience?: string | null;
  professionalGoals?: string[];
  weeklyTimeMinutes?: number | null;
  socialExperience?: string | null;
  postingFrequency?: string | null;
  communicationPreferences?: string[];
  onboardingStep?: number;
  completeOnboarding?: boolean;
};

@Injectable()
export class IdentityService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  normalizeEmail(email: string) { return email.trim().toLowerCase(); }

  private async passwordHash(password: string) {
    const salt = randomBytes(16);
    const derived = await deriveKey(password, salt, 64);
    return `scrypt$${PASSWORD_COST}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  }

  private async passwordMatches(password: string, encoded: string) {
    const [, cost, saltText, hashText] = encoded.split("$");
    if (!cost || !saltText || !hashText || Number(cost) !== PASSWORD_COST) return false;
    const expected = Buffer.from(hashText, "base64url");
    const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  async limit(key: string, max: number, windowSeconds: number) {
    await this.db.$executeRaw`DELETE FROM rate_limit_buckets WHERE reset_at < now() - interval '1 day'`;
    const [row] = await this.db.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_buckets (key, count, reset_at)
      VALUES (${hex(key)}, 1, now() + (${windowSeconds} * interval '1 second'))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.reset_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
        reset_at = CASE WHEN rate_limit_buckets.reset_at <= now() THEN now() + (${windowSeconds} * interval '1 second') ELSE rate_limit_buckets.reset_at END
      RETURNING count`;
    if (row.count > max) throw new HttpException({ code: "rate_limited", message: "Muitas tentativas. Aguarde e tente novamente." }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private mailer() {
    const host = process.env.SMTP_HOST ?? "127.0.0.1";
    const port = Number(process.env.SMTP_PORT ?? 1025);
    return nodemailer.createTransport({ host, port, secure: process.env.SMTP_SECURE === "true", auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  }

  private async issueToken(userId: string, purpose: "verify_email" | "reset_password") {
    const token = opaqueToken();
    const expiresAt = new Date(Date.now() + (purpose === "verify_email" ? EMAIL_TTL_MS : RESET_TTL_MS));
    await this.db.$transaction(async transaction => {
      await transaction.$queryRaw<{ locked: boolean }[]>`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${purpose}`}, 0)) IS NOT NULL AS locked`;
      await transaction.authToken.deleteMany({ where: { userId, purpose } });
      await transaction.authToken.create({ data: { userId, purpose, tokenHash: hex(token), expiresAt } });
    });
    const origin = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
    const path = purpose === "verify_email" ? "/verificar-email" : "/redefinir-senha";
    const subject = purpose === "verify_email" ? "Confirme seu e-mail no Orvia" : "Redefina sua senha do Orvia";
    await this.mailer().sendMail({ from: process.env.MAIL_FROM ?? "Orvia <no-reply@localhost>" , to: (await this.db.user.findUniqueOrThrow({ where: { id: userId } })).email, subject, text: `Acesse ${origin}${path}?token=${encodeURIComponent(token)} para continuar. Este link expira em ${purpose === "verify_email" ? "1 hora" : "30 minutos"}.` });
  }

  async register(emailInput: string, password: string) {
    const email = this.normalizeEmail(emailInput);
    const hashedPassword = await this.passwordHash(password);
    const response = { message: "Se este endereço estiver disponível, enviaremos um e-mail com os próximos passos. Se você já tiver uma conta, entre ou solicite um novo link de confirmação." };
    if (await this.db.user.findUnique({ where: { email } })) return response;
    let user;
    try { user = await this.db.user.create({ data: { email, passwordHash: hashedPassword, profile: { create: {} } } }); }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return response;
      throw error;
    }
    await this.issueToken(user.id, "verify_email");
    return response;
  }

  async verifyEmail(token: string) {
    const tokenHash = hex(token);
    const found = await this.db.authToken.findUnique({ where: { tokenHash } });
    if (!found || found.purpose !== "verify_email") throw new BadRequestException({ code: "invalid_token", message: "Este link não é válido ou já foi utilizado. Se seu e-mail já foi confirmado, entre; caso contrário, solicite um novo link." });
    if (found.expiresAt <= new Date()) throw new BadRequestException({ code: "token_expired", message: "Este link expirou. Solicite um novo link de confirmação para continuar." });
    await this.db.$transaction(async transaction => {
      const consumed = await transaction.authToken.deleteMany({ where: { id: found.id, tokenHash, purpose: "verify_email", expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw new BadRequestException({ code: "token_consumed", message: "Este link já foi utilizado ou expirou. Entre se seu e-mail já foi confirmado; caso contrário, solicite um novo link." });
      await transaction.user.update({ where: { id: found.userId }, data: { emailVerifiedAt: new Date() } });
    });
    return { message: "E-mail confirmado. Você já pode entrar." };
  }

  async login(emailInput: string, password: string, meta: { userAgent?: string }) {
    const user = await this.db.user.findUnique({ where: { email: this.normalizeEmail(emailInput) } });
    const dummyHash = `scrypt$${PASSWORD_COST}$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
    const matches = await this.passwordMatches(password, user?.passwordHash ?? dummyHash);
    if (!user || !matches || !user.emailVerifiedAt) throw new UnauthorizedException({ code: "invalid_credentials", message: "E-mail, senha ou confirmação inválidos." });
    const token = opaqueToken(); const csrf = opaqueToken();
    await this.db.session.create({ data: { tokenHash: hex(token), csrfHash: hex(csrf), userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent: meta.userAgent?.slice(0, 512) } });
    return { token, csrf, expiresIn: SESSION_TTL_MS / 1000, user: { id: user.id, email: user.email, emailVerified: true, onboardingCompleted: Boolean((await this.db.professionalProfile.findUnique({ where: { userId: user.id } }))?.onboardingCompletedAt) } };
  }

  async authenticate(token?: string) {
    if (!token) throw new UnauthorizedException({ code: "unauthorized", message: "Entre para continuar." });
    const session = await this.db.session.findUnique({ where: { tokenHash: hex(token) }, include: { user: { include: { profile: true } } } });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await this.db.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException({ code: "unauthorized", message: "Sua sessão expirou. Entre novamente." });
    }
    return session;
  }

  assertCsrf(sessionCsrfHash: string, cookie?: string, header?: string) {
    if (!cookie || !header || cookie !== header || hex(cookie) !== sessionCsrfHash) throw new BadRequestException({ code: "csrf_failed", message: "Não foi possível validar a solicitação." });
  }

  async logout(sessionId: string) { await this.db.session.deleteMany({ where: { id: sessionId } }); }

  async requestVerification(email: string) {
    const started = Date.now();
    const user = await this.db.user.findUnique({ where: { email: this.normalizeEmail(email) } });
    if (user && !user.emailVerifiedAt) await this.issueToken(user.id, "verify_email");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))));
    return { message: "Se o endereço puder ser confirmado, enviaremos um link em instantes." };
  }

  async requestPasswordReset(email: string) {
    const started = Date.now();
    const user = await this.db.user.findUnique({ where: { email: this.normalizeEmail(email) } });
    if (user?.emailVerifiedAt) await this.issueToken(user.id, "reset_password");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))));
    return { message: "Se houver uma conta verificada para este endereço, enviaremos instruções para redefinir a senha." };
  }

  async resetPassword(token: string, password: string) {
    const found = await this.db.authToken.findUnique({ where: { tokenHash: hex(token) } });
    if (!found || found.purpose !== "reset_password" || found.expiresAt <= new Date()) throw new BadRequestException({ code: "invalid_token", message: "Este link é inválido ou expirou." });
    const passwordHash = await this.passwordHash(password);
    await this.db.$transaction([
      this.db.user.update({ where: { id: found.userId }, data: { passwordHash } }),
      this.db.authToken.deleteMany({ where: { userId: found.userId, purpose: "reset_password" } }),
      this.db.session.deleteMany({ where: { userId: found.userId } }),
    ]);
    return { message: "Senha redefinida. Entre com sua nova senha." };
  }

  async getProfile(userId: string) { return this.db.professionalProfile.findUniqueOrThrow({ where: { userId } }); }

  async saveProfile(userId: string, input: ProfileInput) {
    const { completeOnboarding } = input;
    const data: Omit<ProfileInput, "completeOnboarding"> = {
      professionalName: input.professionalName,
      profession: input.profession,
      specialty: input.specialty,
      city: input.city,
      region: input.region,
      serviceMode: input.serviceMode,
      targetAudience: input.targetAudience,
      professionalGoals: input.professionalGoals,
      weeklyTimeMinutes: input.weeklyTimeMinutes,
      socialExperience: input.socialExperience,
      postingFrequency: input.postingFrequency,
      communicationPreferences: input.communicationPreferences,
      onboardingStep: input.onboardingStep,
    };
    if (completeOnboarding) {
      const current = await this.db.professionalProfile.findUniqueOrThrow({ where: { userId } });
      const provided = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
      const combined = { ...current, ...provided };
      if (!combined.professionalName?.trim() || !combined.profession?.trim() || !combined.serviceMode?.trim()) throw new BadRequestException({ code: "profile_incomplete", message: "Informe seu nome profissional, profissão e modalidade de atendimento para concluir." });
    }
    return this.db.professionalProfile.update({ where: { userId }, data: { ...data, ...(completeOnboarding ? { onboardingCompletedAt: new Date(), onboardingStep: 5 } : {}) } });
  }
}
