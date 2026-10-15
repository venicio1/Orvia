import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service";
import { IdentityService } from "../src/modules/identity/identity.service";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("Identity persistence and user isolation (PostgreSQL)", () => {
  const db = new PrismaService();
  const emails = Array.from({ length: 5 }, () => `${randomUUID()}@orvia-test.local`);
  const identity = new IdentityService(db);
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.onModuleDestroy();
  });

  it("persists profiles and sessions independently for two users", async () => {
    const [first, second] = await Promise.all(emails.slice(0, 2).map(email => db.user.create({ data: { email, passwordHash: "test-only-hash", emailVerifiedAt: new Date(), profile: { create: {} } }, include: { profile: true } })));
    await db.professionalProfile.update({ where: { userId: first.id }, data: { profession: "Psicologia", onboardingStep: 2 } });
    await db.session.create({ data: { userId: first.id, tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64), csrfHash: randomUUID().replaceAll("-", "").padEnd(64, "b").slice(0, 64), expiresAt: new Date(Date.now() + 60_000) } });
    const [savedFirst, untouchedSecond, session] = await Promise.all([
      db.professionalProfile.findUniqueOrThrow({ where: { userId: first.id } }),
      db.professionalProfile.findUniqueOrThrow({ where: { userId: second.id } }),
      db.session.findFirst({ where: { userId: first.id } }),
    ]);
    expect(savedFirst).toMatchObject({ userId: first.id, profession: "Psicologia", onboardingStep: 2 });
    expect(untouchedSecond).toMatchObject({ userId: second.id, profession: null, onboardingStep: 0 });
    expect(session?.userId).toBe(first.id);
  });

  it("allows only one account when normalized duplicate registrations race", async () => {
    const [first, second] = await Promise.all([
      identity.register(emails[2], "A sufficiently long password 123!"),
      identity.register(`  ${emails[2].toUpperCase()}  `, "A sufficiently long password 123!"),
    ]);
    expect(first).toEqual(second);
    const account = await db.user.findUniqueOrThrow({ where: { email: emails[2] } });
    expect(await db.user.count({ where: { email: emails[2] } })).toBe(1);
    expect(await db.professionalProfile.count({ where: { userId: account.id } })).toBe(1);
    expect(await db.authToken.count({ where: { userId: account.id, purpose: "verify_email" } })).toBe(1);
  });

  it("reissues one confirmation token, rejects expired links, and consumes a valid link once", async () => {
    const created = await db.user.create({ data: { email: emails[3], passwordHash: "test-only-hash", profile: { create: {} } } });
    await identity.requestVerification(created.email);
    const firstToken = await db.authToken.findFirstOrThrow({ where: { userId: created.id, purpose: "verify_email" } });
    expect(firstToken.expiresAt.getTime() - Date.now()).toBeGreaterThan(3_590_000);
    await identity.requestVerification(created.email);
    const replacementTokens = await db.authToken.findMany({ where: { userId: created.id, purpose: "verify_email" } });
    expect(replacementTokens).toHaveLength(1);
    expect(replacementTokens[0].tokenHash).not.toBe(firstToken.tokenHash);

    const validRawToken = randomBytes(32).toString("base64url");
    const now = Date.now();
    await db.authToken.deleteMany({ where: { userId: created.id, purpose: "verify_email" } });
    await db.authToken.create({ data: { userId: created.id, purpose: "verify_email", tokenHash: createHash("sha256").update(validRawToken).digest("hex"), createdAt: new Date(now - 60_000), expiresAt: new Date(now + 60_000) } });
    const expiredUser = await db.user.create({ data: { email: emails[4], passwordHash: "test-only-hash", profile: { create: {} } } });
    const expiredRawToken = randomBytes(32).toString("base64url");
    await db.authToken.create({ data: { userId: expiredUser.id, purpose: "verify_email", tokenHash: createHash("sha256").update(expiredRawToken).digest("hex"), createdAt: new Date(now - 2 * 60 * 60_000), expiresAt: new Date(now - 60_000) } });
    await expect(identity.verifyEmail(expiredRawToken)).rejects.toMatchObject({ response: { code: "token_expired" } });
    const concurrentConfirmations = await Promise.allSettled([identity.verifyEmail(validRawToken), identity.verifyEmail(validRawToken)]);
    expect(concurrentConfirmations.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrentConfirmations.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(identity.verifyEmail(validRawToken)).rejects.toMatchObject({ response: { code: "invalid_token" } });
    expect(await db.user.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ emailVerifiedAt: expect.any(Date) });
  });
});
