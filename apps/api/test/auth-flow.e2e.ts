import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service";

const web = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
const mailpit = process.env.MAILPIT_URL ?? "http://localhost:8025";
const origin = web;
const email = `${randomUUID()}@orvia-test.local`;
const secondEmail = `${randomUUID()}@orvia-test.local`;
const password = `Orvia-${randomBytes(18).toString("base64url")}Aa1!`;
const nextPassword = `Orvia-${randomBytes(18).toString("base64url")}Bb2!`;
const db = new PrismaService();
const rateKey = (value: string) => createHash("sha256").update(value).digest("hex");
const localIps = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const testRateKeys = [
  ...["register", "login", "verify", "reset"].flatMap(action => localIps.map(ip => rateKey(`${action}-ip:${ip}`))),
  ...[email, secondEmail].flatMap(account => ["register-email", "login-email", "verify-email", "reset-email"].map(action => rateKey(`${action}:${account}`))),
];

async function request(path: string, options: { method?: string; body?: unknown; cookie?: string; csrf?: string; requestOrigin?: string } = {}) {
  const response = await fetch(`${web}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
      ...(options.method && options.method !== "GET" ? { origin: options.requestOrigin ?? origin } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    redirect: "manual",
  });
  return response;
}

async function json(response: Response) { return response.json() as Promise<Record<string, unknown>>; }
async function mailCountFor(recipient: string, subject: string) {
  const listing = await fetch(`${mailpit}/api/v1/messages`).then(response => response.json()) as { messages: Array<{ To: Array<{ Address: string }>; Subject: string }> };
  return listing.messages.filter(message => message.Subject === subject && message.To.some(to => to.Address === recipient)).length;
}
async function mailLinksFor(recipient: string, subject: string) {
  const listing = await fetch(`${mailpit}/api/v1/messages`).then(response => response.json()) as { messages: Array<{ ID: string; To: Array<{ Address: string }>; Subject: string }> };
  const summaries = listing.messages.filter(message => message.Subject === subject && message.To.some(to => to.Address === recipient));
  const links = await Promise.all(summaries.map(async summary => {
    const message = await fetch(`${mailpit}/api/v1/message/${summary.ID}`).then(response => response.json()) as { Text: string };
    const match = message.Text.match(/https?:\/\/[^\s]+/);
    assert.ok(match, "mensagem contém link de uso único");
    return new URL(match[0]);
  }));
  return links;
}
async function mailFor(recipient: string, subject: string) {
  const links = await mailLinksFor(recipient, subject);
  assert.ok(links.length, `e-mail “${subject}” enviado para ${recipient} aparece no Mailpit`);
  return links.at(-1)!;
}

async function verify(recipient: string) {
  const link = await mailFor(recipient, "Confirme seu e-mail no Orvia");
  const result = await request("/api/auth/verify-email", { method: "POST", body: { token: link.searchParams.get("token") } });
  assert.equal(result.status, 201, "confirmação de e-mail completa");
  const replay = await request("/api/auth/verify-email", { method: "POST", body: { token: link.searchParams.get("token") } });
  assert.equal(replay.status, 400, "token de confirmação não pode ser reutilizado");
}

async function login(account: string, secret: string) {
  const response = await request("/api/auth/login", { method: "POST", body: { email: account, password: secret } });
  assert.equal(response.status, 201, `login de ${account}`);
  const cookies = response.headers.getSetCookie();
  const session = cookies.find(value => value.startsWith("orvia_session="))?.split(";", 1)[0];
  const csrf = cookies.find(value => value.startsWith("orvia_csrf="))?.split(";", 1)[0];
  assert.ok(session?.startsWith("orvia_session="), "cookie de sessão emitido");
  assert.ok(csrf?.startsWith("orvia_csrf="), "cookie CSRF emitido");
  return { cookie: `${session}; ${csrf}`, csrf: csrf!.slice("orvia_csrf=".length) };
}

async function main() {
  await db.rateLimitBucket.deleteMany({ where: { key: { in: testRateKeys } } });
  const page = await fetch(`${web}/`, { redirect: "manual" });
  assert.equal(page.status, 307, "home privada redireciona quando não há sessão");
  assert.equal(page.headers.get("location"), "/entrar");
  const privateApi = await request("/api/auth/profile");
  assert.equal(privateApi.status, 401, "perfil exige sessão");
  const privatePage = await request("/perfil");
  assert.equal(privatePage.status, 307, "página de perfil redireciona quando não há sessão");
  assert.equal(privatePage.headers.get("location"), "/entrar");

  assert.equal((await request("/api/auth/register", { method: "POST", requestOrigin: "https://example.invalid", body: { email, password } })).status, 400, "origem externa é recusada");
  const mailCountBeforeRegistration = await mailCountFor(email, "Confirme seu e-mail no Orvia");
  const registration = await request("/api/auth/register", { method: "POST", body: { email, password } });
  assert.equal(registration.status, 201, "cadastro aceito");
  const registrationMessage = await json(registration);
  assert.equal(await mailCountFor(email, "Confirme seu e-mail no Orvia"), mailCountBeforeRegistration + 1, "novo e-mail recebe uma confirmação no Mailpit");
  const userA = await db.user.findUniqueOrThrow({ where: { email }, include: { profile: true } });
  assert.ok(userA.profile, "perfil inicial criado no cadastro");
  const duplicate = await request("/api/auth/register", { method: "POST", body: { email: `  ${email.toUpperCase()}  `, password } });
  assert.equal(duplicate.status, 201, "cadastro duplicado usa resposta não enumerável");
  assert.deepEqual(await json(duplicate), registrationMessage, "cadastro duplicado mantém exatamente a mesma resposta genérica");
  assert.equal(await db.user.count({ where: { email } }), 1, "cadastro duplicado com variação de caixa não cria outro usuário");
  assert.equal(await mailCountFor(email, "Confirme seu e-mail no Orvia"), mailCountBeforeRegistration + 1, "cadastro repetido não envia confirmação automaticamente enquanto a conta ainda não foi confirmada");
  assert.equal((await request("/api/auth/login", { method: "POST", body: { email, password } })).status, 401, "login exige e-mail confirmado");
  const oldVerificationLink = (await mailLinksFor(email, "Confirme seu e-mail no Orvia"))[0];
  assert.ok(oldVerificationLink, "o link inicial de confirmação está no Mailpit");
  const resend = await request("/api/auth/resend-verification", { method: "POST", body: { email: `  ${email.toUpperCase()}  ` } });
  assert.equal(resend.status, 201, "reenvio aceita e-mail existente ainda não confirmado");
  assert.equal(await mailCountFor(email, "Confirme seu e-mail no Orvia"), mailCountBeforeRegistration + 2, "o pedido explícito de reenvio produz uma nova mensagem");
  const verificationLinks = await mailLinksFor(email, "Confirme seu e-mail no Orvia");
  const oldToken = oldVerificationLink.searchParams.get("token");
  const currentVerificationLink = verificationLinks.find(link => link.searchParams.get("token") !== oldToken);
  assert.ok(currentVerificationLink, "o reenvio substitui o token anterior");
  assert.equal((await request("/api/auth/verify-email", { method: "POST", body: { token: oldToken } })).status, 400, "link antigo é recusado após o reenvio");
  const confirmed = await request("/api/auth/verify-email", { method: "POST", body: { token: currentVerificationLink.searchParams.get("token") } });
  assert.equal(confirmed.status, 201, "link de reenvio confirma a conta na primeira utilização");
  assert.equal((await request("/api/auth/verify-email", { method: "POST", body: { token: currentVerificationLink.searchParams.get("token") } })).status, 400, "link de confirmação não pode ser reutilizado");
  const verifiedDuplicate = await request("/api/auth/register", { method: "POST", body: { email: email.toUpperCase(), password } });
  assert.equal(verifiedDuplicate.status, 201, "cadastro de e-mail confirmado mantém resposta neutra");
  assert.deepEqual(await json(verifiedDuplicate), registrationMessage, "conta confirmada recebe a mesma resposta genérica");
  assert.equal(await db.user.count({ where: { email } }), 1, "cadastro repetido após confirmação não duplica o usuário");
  assert.equal(await mailCountFor(email, "Confirme seu e-mail no Orvia"), mailCountBeforeRegistration + 2, "cadastro repetido de conta confirmada não envia confirmação adicional");
  assert.equal((await request("/api/auth/login", { method: "POST", body: { email, password: "curta" } })).status, 401, "senha curta incorreta falha como credencial inválida, não como validação de cadastro");
  const accountA = await login(email, password);
  const meA = await request("/api/auth/me", { cookie: accountA.cookie });
  assert.equal(meA.status, 200, "sessão permite consultar a identidade");
  const saved = await request("/api/auth/profile", { method: "PATCH", cookie: accountA.cookie, csrf: accountA.csrf, body: { professionalName: "Profissional de teste", profession: "Nutrição", serviceMode: "Online", onboardingStep: 2, weeklyTimeMinutes: 120 } });
  assert.equal(saved.status, 200, "perfil parcial salvo com CSRF");
  const savedProfile = (await json(saved)).profile as Record<string, unknown>;
  assert.equal(savedProfile.professionalName, "Profissional de teste", `salvamento parcial persiste nome (${JSON.stringify(savedProfile)})`);
  const onboardingPage = await request("/onboarding", { cookie: accountA.cookie });
  assert.equal(onboardingPage.status, 200, "onboarding retoma com a sessão ativa");
  assert.match(await onboardingPage.text(), /Etapa 3 de 5/, "onboarding retoma visualmente na etapa salva");
  const progress = (await json(await request("/api/auth/profile", { cookie: accountA.cookie }))).profile as Record<string, unknown>;
  assert.equal(progress.onboardingStep, 2, "etapa parcial fica persistida para retomada");
  const incompleteHome = await request("/", { cookie: accountA.cookie });
  assert.equal(incompleteHome.status, 307, "perfil incompleto não entra no dashboard");
  assert.equal(incompleteHome.headers.get("location"), "/onboarding");
  const noCsrf = await request("/api/auth/profile", { method: "PATCH", cookie: accountA.cookie, body: { profession: "Outro" } });
  assert.equal(noCsrf.status, 400, "alteração sem CSRF é recusada");

  await request("/api/auth/register", { method: "POST", body: { email: secondEmail, password } });
  await verify(secondEmail);
  const userB = await db.user.findUniqueOrThrow({ where: { email: secondEmail } });
  const accountB = await login(secondEmail, password);
  const emptyProfile = await request("/api/auth/profile", { cookie: accountB.cookie });
  assert.equal(emptyProfile.status, 200);
  const profileB = (await json(emptyProfile)).profile as Record<string, unknown>;
  assert.equal(profileB.profession, null, "conta B não recebe dados da conta A");
  const spoof = await request("/api/auth/profile", { method: "PATCH", cookie: accountB.cookie, csrf: accountB.csrf, body: { userId: userA.id, profession: "Não autorizado" } });
  assert.equal(spoof.status, 400, "API rejeita ID de usuário injetado no DTO");
  const [unchanged, changedB] = await Promise.all([
    db.professionalProfile.findUniqueOrThrow({ where: { userId: userA.id } }),
    db.professionalProfile.findUniqueOrThrow({ where: { userId: userB.id } }),
  ]);
  assert.equal(unchanged.profession, "Nutrição", "tentativa da conta B não alterou perfil da conta A");
  assert.equal(changedB.profession, null, "tentativa inválida não altera perfil da conta B");

  const completed = await request("/api/auth/profile", { method: "PATCH", cookie: accountA.cookie, csrf: accountA.csrf, body: { completeOnboarding: true, onboardingStep: 5 } });
  const completionText = await completed.text();
  assert.equal(completed.status, 200, `onboarding conclui com os dados mínimos preenchidos (${completionText}; ${JSON.stringify(await db.professionalProfile.findUnique({ where: { userId: userA.id } }))})`);
  const completedHome = await request("/", { cookie: accountA.cookie });
  assert.equal(completedHome.status, 200, "dashboard privado abre após onboarding");
  assert.match(await completedHome.text(), /Profissional de teste/, "dashboard usa dados persistidos do perfil");
  const editableProfile = await request("/perfil", { cookie: accountA.cookie });
  assert.equal(editableProfile.status, 200, "perfil permanece editável após onboarding");
  assert.match(await editableProfile.text(), /Seu perfil, do seu jeito/);

  const logout = await request("/api/auth/logout", { method: "POST", cookie: accountA.cookie, csrf: accountA.csrf });
  assert.equal(logout.status, 201, "logout encerra sessão com CSRF");
  assert.equal((await request("/api/auth/me", { cookie: accountA.cookie })).status, 401, "sessão revogada não autentica");

  const accountBeforeReset = await login(email, password);
  const forgot = await request("/api/auth/forgot-password", { method: "POST", body: { email } });
  assert.equal(forgot.status, 201, "solicitação de recuperação aceita");
  const resetLink = await mailFor(email, "Redefina sua senha do Orvia");
  const reset = await request("/api/auth/reset-password", { method: "POST", body: { token: resetLink.searchParams.get("token"), password: nextPassword } });
  assert.equal(reset.status, 201, "senha redefinida por link de uso único");
  assert.equal((await request("/api/auth/reset-password", { method: "POST", body: { token: resetLink.searchParams.get("token"), password } })).status, 400, "token de redefinição não pode ser reutilizado");
  assert.equal((await request("/api/auth/me", { cookie: accountBeforeReset.cookie })).status, 401, "reset revoga sessões ativas");
  assert.equal((await request("/api/auth/login", { method: "POST", body: { email, password } })).status, 401, "senha anterior deixou de funcionar");
  const accountAfterReset = await login(email, nextPassword);
  const logoutAfterReset = await request("/api/auth/logout", { method: "POST", cookie: accountAfterReset.cookie, csrf: accountAfterReset.csrf });
  assert.equal(logoutAfterReset.status, 201, "nova sessão também pode ser revogada");
  console.log("Fluxo E2E aprovado: cadastro, e-mail, login, sessão, CSRF, onboarding parcial/perfil, isolamento, logout e recuperação.");
}

async function run() {
  try {
    assert.equal(new URL(web).hostname, "localhost", "o fluxo E2E deve usar o web local");
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname), "o fluxo E2E deve usar o PostgreSQL local");
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(mailpit).hostname), "o fluxo E2E deve usar o Mailpit local");
    await db.$connect(); await main();
  }
  finally {
    await db.user.deleteMany({ where: { email: { in: [email, secondEmail] } } });
    await db.rateLimitBucket.deleteMany({ where: { key: { in: testRateKeys } } });
    await db.onModuleDestroy();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
