import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service";
import { InstagramInsightsPersistenceService, MEDIA_INSIGHT_METRICS } from "../src/modules/social-integrations/instagram-insights-persistence.service";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("Instagram Insights persistence (PostgreSQL)", () => {
  const db = new PrismaService();
  const email = `${randomUUID()}@orvia-insights-test.local`;
  const secondEmail = `${randomUUID()}@orvia-insights-test.local`;
  const userIds: string[] = [];
  const persistence = new InstagramInsightsPersistenceService(db);
  const referenceDate = new Date("2026-10-14T00:00:00.000Z");
  const nextReferenceDate = new Date("2026-10-15T00:00:00.000Z");
  const apiVersion = "v26.0";

  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => {
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.onModuleDestroy();
  });

  it("keeps zero, missing, daily history, lifetime history, ownership, and failed-snapshot preservation distinct", async () => {
    const [user, secondUser] = await Promise.all([
      db.user.create({ data: { email, passwordHash: "integration-fixture-only", emailVerifiedAt: new Date(), profile: { create: {} } } }),
      db.user.create({ data: { email: secondEmail, passwordHash: "integration-fixture-only", emailVerifiedAt: new Date(), profile: { create: {} } } }),
    ]);
    userIds.push(user.id, secondUser.id);
    const account = await db.socialAccount.create({ data: {
      userId: user.id, provider: "instagram_facebook_login", providerAccountId: randomUUID(), pageId: randomUUID(),
      pageName: "Fixture only", username: "fixture_only", status: "connected",
    } });
    const carousel = await db.instagramMediaPost.create({ data: {
      userId: user.id, socialAccountId: account.id, providerMediaId: randomUUID(), mediaType: "CAROUSEL_ALBUM",
      source: "instagram_graph_api", apiVersion, fetchedAt: new Date(),
    } });
    const image = await db.instagramMediaPost.create({ data: {
      userId: user.id, socialAccountId: account.id, providerMediaId: randomUUID(), mediaType: "IMAGE",
      source: "instagram_graph_api", apiVersion, fetchedAt: new Date(),
    } });

    const accountRun = await persistence.beginSync(user.id, account.id, "account", apiVersion);
    expect(accountRun.outcome).toBe("started");
    if (accountRun.outcome !== "started") throw new Error("Expected account sync to start");
    expect(await persistence.beginSync(user.id, account.id, "account", apiVersion)).toMatchObject({ outcome: "in_progress" });
    await persistence.finishSync(user.id, account.id, accountRun.run.id, {
      status: "succeeded", collectedAt: new Date(), accountMetrics: [{ metric: "reach", value: 0, referenceDate }],
    });
    expect(await persistence.readAccountHistory(user.id, account.id)).toHaveLength(1);
    expect((await persistence.readAccountHistory(user.id, account.id))[0]?.value.toString()).toBe("0");
    expect(await persistence.beginSync(user.id, account.id, "account", apiVersion)).toMatchObject({ outcome: "cooldown" });

    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "account" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const missingRun = await persistence.beginSync(user.id, account.id, "account", apiVersion);
    if (missingRun.outcome !== "started") throw new Error("Expected second account sync to start");
    await persistence.finishSync(user.id, account.id, missingRun.run.id, {
      status: "partial", collectedAt: new Date(), missingMetrics: ["reach"],
    });
    expect(await db.instagramInsightSyncRun.findUniqueOrThrow({ where: { id: missingRun.run.id } })).toMatchObject({ status: "partial", missingMetrics: ["reach"] });
    expect((await persistence.readAccountHistory(user.id, account.id))[0]?.value.toString()).toBe("0");

    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "account" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const dailyUpdate = await persistence.beginSync(user.id, account.id, "account", apiVersion);
    if (dailyUpdate.outcome !== "started") throw new Error("Expected daily update sync to start");
    await persistence.finishSync(user.id, account.id, dailyUpdate.run.id, {
      status: "succeeded", collectedAt: new Date(), accountMetrics: [{ metric: "reach", value: 27, referenceDate }],
    });
    expect(await db.instagramAccountInsight.count({ where: { userId: user.id, socialAccountId: account.id } })).toBe(1);
    expect((await persistence.readAccountHistory(user.id, account.id))[0]?.value.toString()).toBe("27");

    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "account" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const dailyHistory = await persistence.beginSync(user.id, account.id, "account", apiVersion);
    if (dailyHistory.outcome !== "started") throw new Error("Expected historical daily sync to start");
    await persistence.finishSync(user.id, account.id, dailyHistory.run.id, {
      status: "succeeded", collectedAt: new Date(), accountMetrics: [{ metric: "reach", value: 31, referenceDate: nextReferenceDate }],
    });
    expect(await db.instagramAccountInsight.count({ where: { userId: user.id, socialAccountId: account.id } })).toBe(2);

    const beforeFailedAccountSync = await persistence.readAccountHistory(user.id, account.id);
    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "account" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const failedAccountRun = await persistence.beginSync(user.id, account.id, "account", apiVersion);
    if (failedAccountRun.outcome !== "started") throw new Error("Expected account failure sync to start");
    await persistence.finishSync(user.id, account.id, failedAccountRun.run.id, { status: "failed", collectedAt: new Date(), errorCode: "graph_timeout" });
    expect(await persistence.readAccountHistory(user.id, account.id)).toEqual(beforeFailedAccountSync);

    const mediaRun = await persistence.beginSync(user.id, account.id, "media", apiVersion);
    if (mediaRun.outcome !== "started") throw new Error("Expected media sync to start");
    const mediaMetrics = MEDIA_INSIGHT_METRICS.map(metric => ({ mediaPostId: carousel.id, metric, value: metric === "total_interactions" ? 133 : metric === "reach" ? 0 : 12 }));
    await persistence.finishSync(user.id, account.id, mediaRun.run.id, { status: "succeeded", collectedAt: new Date(), mediaMetrics });
    const firstLifetimeSnapshot = await persistence.readMediaHistory(user.id, account.id, carousel.id);
    expect(firstLifetimeSnapshot).toHaveLength(MEDIA_INSIGHT_METRICS.length);
    expect(firstLifetimeSnapshot.find(item => item.metric === "reach")?.value.toString()).toBe("0");
    expect(firstLifetimeSnapshot.find(item => item.metric === "total_interactions")?.value.toString()).toBe("133");
    expect(firstLifetimeSnapshot.every(item => item.period === "lifetime" && item.mediaType === "CAROUSEL_ALBUM" && item.source === "instagram_graph_api" && item.apiVersion === apiVersion)).toBe(true);
    await expect(db.instagramMediaInsight.create({ data: {
      userId: user.id, socialAccountId: account.id, mediaPostId: carousel.id, mediaType: "CAROUSEL_ALBUM", syncRunId: mediaRun.run.id,
      metric: "reach", value: 0, period: "lifetime", referenceDate, collectedAt: new Date(), source: "instagram_graph_api", apiVersion,
    } })).rejects.toThrow();

    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "media" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const nextMediaRun = await persistence.beginSync(user.id, account.id, "media", apiVersion);
    if (nextMediaRun.outcome !== "started") throw new Error("Expected second media sync to start");
    await persistence.finishSync(user.id, account.id, nextMediaRun.run.id, { status: "succeeded", collectedAt: new Date(), mediaMetrics });
    expect(await db.instagramMediaInsight.count({ where: { userId: user.id, socialAccountId: account.id, mediaPostId: carousel.id } })).toBe(2 * MEDIA_INSIGHT_METRICS.length);

    await db.instagramInsightSyncState.update({ where: { socialAccountId_scope: { socialAccountId: account.id, scope: "media" } }, data: { nextSyncAt: new Date(Date.now() - 1) } });
    const failedRun = await persistence.beginSync(user.id, account.id, "media", apiVersion);
    if (failedRun.outcome !== "started") throw new Error("Expected failed media sync to start");
    await persistence.finishSync(user.id, account.id, failedRun.run.id, { status: "failed", collectedAt: new Date(), errorCode: "graph_timeout" });
    expect(await db.instagramMediaInsight.count({ where: { userId: user.id, socialAccountId: account.id, mediaPostId: carousel.id } })).toBe(2 * MEDIA_INSIGHT_METRICS.length);

    await expect(persistence.beginSync(secondUser.id, account.id, "account", apiVersion)).rejects.toThrow();
    await expect(persistence.readAccountHistory(secondUser.id, account.id)).resolves.toHaveLength(0);
    await expect(persistence.readMediaHistory(user.id, account.id, image.id)).resolves.toHaveLength(0);
  });

  it("enforces tenant and media-type constraints at the PostgreSQL layer", async () => {
    const [owner, other] = await Promise.all([
      db.user.create({ data: { email: `${randomUUID()}@orvia-insights-test.local`, passwordHash: "integration-fixture-only", emailVerifiedAt: new Date(), profile: { create: {} } } }),
      db.user.create({ data: { email: `${randomUUID()}@orvia-insights-test.local`, passwordHash: "integration-fixture-only", emailVerifiedAt: new Date(), profile: { create: {} } } }),
    ]);
    userIds.push(owner.id, other.id);
    const account = await db.socialAccount.create({ data: {
      userId: owner.id, provider: "instagram_facebook_login", providerAccountId: randomUUID(), pageId: randomUUID(), status: "connected",
    } });
    const post = await db.instagramMediaPost.create({ data: {
      userId: owner.id, socialAccountId: account.id, providerMediaId: randomUUID(), mediaType: "CAROUSEL_ALBUM", source: "instagram_graph_api", apiVersion, fetchedAt: new Date(),
    } });
    const otherAccount = await db.socialAccount.create({ data: {
      userId: owner.id, provider: "instagram_facebook_login", providerAccountId: randomUUID(), pageId: randomUUID(), status: "connected",
    } });
    const otherPost = await db.instagramMediaPost.create({ data: {
      userId: owner.id, socialAccountId: otherAccount.id, providerMediaId: randomUUID(), mediaType: "CAROUSEL_ALBUM", source: "instagram_graph_api", apiVersion, fetchedAt: new Date(),
    } });
    const run = await db.instagramInsightSyncRun.create({ data: {
      userId: owner.id, socialAccountId: account.id, scope: "media", status: "succeeded", apiVersion, finishedAt: new Date(),
    } });
    const common = { socialAccountId: account.id, mediaPostId: post.id, mediaType: "CAROUSEL_ALBUM", syncRunId: run.id, metric: "reach", value: 1, period: "lifetime", referenceDate, collectedAt: new Date(), apiVersion, userId: other.id };
    await expect(db.instagramMediaInsight.create({ data: common })).rejects.toThrow();
    await expect(db.instagramMediaInsight.create({ data: { ...common, userId: owner.id, mediaType: "IMAGE" } })).rejects.toThrow();
    await expect(db.instagramMediaInsight.create({ data: { ...common, userId: owner.id, mediaPostId: otherPost.id } })).rejects.toThrow();
    await expect(db.instagramMediaInsight.create({ data: { ...common, userId: owner.id, metric: "profile_visits" } })).rejects.toThrow();
    await expect(db.instagramMediaInsight.create({ data: { ...common, userId: owner.id, period: "day" } })).rejects.toThrow();

    const accountInsight = {
      userId: other.id, socialAccountId: account.id, syncRunId: run.id, metric: "reach", value: 1,
      period: "day", referenceDate, collectedAt: new Date(), source: "instagram_graph_api", apiVersion,
    };
    await expect(db.instagramAccountInsight.create({ data: accountInsight })).rejects.toThrow();
    await expect(db.instagramAccountInsight.create({ data: { ...accountInsight, userId: owner.id, metric: "likes" } })).rejects.toThrow();
    await expect(db.instagramAccountInsight.create({ data: { ...accountInsight, userId: owner.id, period: "lifetime" } })).rejects.toThrow();
  });
});
