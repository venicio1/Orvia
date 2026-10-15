import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service";
import { DiagnosticsService } from "../src/modules/diagnostics/diagnostics.service";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("diagnostic persistence and isolation (PostgreSQL)", () => {
  const db = new PrismaService();
  const emails = Array.from({ length: 3 }, () => `${randomUUID()}@orvia-test.local`);
  const diagnostics = new DiagnosticsService(db);
  const userIds: string[] = [];

  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => {
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.onModuleDestroy();
  });

  async function createUser(email: string) {
    return db.user.create({ data: { email, passwordHash: "test-only-hash", emailVerifiedAt: new Date(), profile: { create: {
      profession: "Psicóloga", specialty: "Psicologia clínica", region: "Paraná", targetAudience: "Adultos", professionalGoals: ["Comunicar meu trabalho com clareza"],
      weeklyTimeMinutes: 60, socialExperience: "Estou começando", postingFrequency: "Ainda não publico", serviceMode: "Online", communicationPreferences: [],
    } } }, include: { profile: true } });
  }

  it("returns the same saved version for concurrent repeated requests", async () => {
    const user = await createUser(emails[0]!); userIds.push(user.id);
    const results = await Promise.all([diagnostics.generateOrReturnCurrent(user.id), diagnostics.generateOrReturnCurrent(user.id)]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(await db.diagnostic.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.strategy.findUnique({ where: { diagnosticId: results[0]!.id } })).toMatchObject({ userId: user.id });
  });

  it("preserves prior versions after profile changes and scopes history to its user", async () => {
    const firstUser = await createUser(emails[1]!); const secondUser = await createUser(emails[2]!); userIds.push(firstUser.id, secondUser.id);
    const first = await diagnostics.generateOrReturnCurrent(firstUser.id);
    const other = await diagnostics.generateOrReturnCurrent(secondUser.id);
    await db.professionalProfile.update({ where: { userId: firstUser.id }, data: { weeklyTimeMinutes: 30 } });
    const changed = await diagnostics.generateOrReturnCurrent(firstUser.id);
    expect(changed.version).toBe(first.version + 1);
    expect(await db.diagnostic.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "superseded" });
    expect(await diagnostics.history(firstUser.id)).toHaveLength(2);
    expect(await diagnostics.history(firstUser.id)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: other.id })]));
    await expect(diagnostics.get(firstUser.id, other.id)).rejects.toMatchObject({ response: { code: "diagnostic_not_found" } });
  });
});
