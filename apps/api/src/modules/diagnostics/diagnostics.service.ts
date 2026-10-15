import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { createDiagnostic, DIAGNOSTIC_CRITERIA_VERSION, type DiagnosticProfile } from "./diagnostic.engine";

const snapshotFor = (profile: NonNullable<Awaited<ReturnType<PrismaService["professionalProfile"]["findUnique"]>>>) => ({
  profession: profile.profession,
  specialty: profile.specialty,
  region: profile.region,
  targetAudience: profile.targetAudience?.trim() ? "[informado]" : null,
  professionalGoals: profile.professionalGoals,
  weeklyTimeMinutes: profile.weeklyTimeMinutes,
  socialExperience: profile.socialExperience,
  postingFrequency: profile.postingFrequency,
  serviceMode: profile.serviceMode,
  communicationPreferences: profile.communicationPreferences,
});

@Injectable()
export class DiagnosticsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async generateOrReturnCurrent(userId: string) {
    return this.db.$transaction(async transaction => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0)) IS NOT NULL AS locked`;
      const profile = await transaction.professionalProfile.findUnique({ where: { userId } });
      if (!profile) throw new NotFoundException({ code: "profile_not_found", message: "Não encontramos o perfil profissional desta conta." });

      const snapshot = snapshotFor(profile) as DiagnosticProfile;
      const serialized = JSON.stringify(snapshot);
      const fingerprint = createHash("sha256").update(`${DIAGNOSTIC_CRITERIA_VERSION}:${serialized}`).digest("hex");
      const current = await transaction.diagnostic.findFirst({ where: { userId, status: "current" }, include: { strategy: true }, orderBy: { version: "desc" } });
      if (current?.inputFingerprint === fingerprint && current.criteriaVersion === DIAGNOSTIC_CRITERIA_VERSION) return current;

      if (current) await transaction.diagnostic.update({ where: { id: current.id }, data: { status: "superseded" } });
      const version = (await transaction.diagnostic.findFirst({ where: { userId }, orderBy: { version: "desc" }, select: { version: true } }))?.version ?? 0;
      const { result, strategy } = createDiagnostic(snapshot);
      const diagnostic = await transaction.diagnostic.create({ data: {
        userId, version: version + 1, criteriaVersion: DIAGNOSTIC_CRITERIA_VERSION,
        profileSnapshot: snapshot as Prisma.InputJsonValue, inputFingerprint: fingerprint, result: result as Prisma.InputJsonValue,
        strategy: { create: { user: { connect: { id: userId } }, objective: strategy.objective, plan: strategy as unknown as Prisma.InputJsonValue, guardrails: strategy.guardrails as Prisma.InputJsonValue } },
      }, include: { strategy: true } });
      return diagnostic;
    });
  }

  async history(userId: string) {
    return this.db.diagnostic.findMany({ where: { userId }, include: { strategy: true }, orderBy: { version: "desc" } });
  }

  async get(userId: string, id: string) {
    const diagnostic = await this.db.diagnostic.findFirst({ where: { id, userId }, include: { strategy: true } });
    if (!diagnostic) throw new NotFoundException({ code: "diagnostic_not_found", message: "Este diagnóstico não foi encontrado." });
    return diagnostic;
  }

  async markReviewed(userId: string, id: string) {
    const found = await this.db.diagnostic.findFirst({ where: { id, userId }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: "diagnostic_not_found", message: "Este diagnóstico não foi encontrado." });
    await this.db.diagnostic.updateMany({ where: { id, userId, status: "current", reviewedAt: null }, data: { reviewedAt: new Date() } });
    return this.get(userId, id);
  }
}
