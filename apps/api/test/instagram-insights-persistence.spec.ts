import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { InstagramInsightsPersistenceService } from "../src/modules/social-integrations/instagram-insights-persistence.service";

const userId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0001";
const otherUserId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0003";
const accountId = "b43f21e5-485a-4d67-84c7-9a8d8b0c0002";
const postId = "d43f21e5-485a-4d67-84c7-9a8d8b0c0004";
const imagePostId = "a43f21e5-485a-4d67-84c7-9a8d8b0c0007";
const runId = "e43f21e5-485a-4d67-84c7-9a8d8b0c0005";
const stateId = "f43f21e5-485a-4d67-84c7-9a8d8b0c0006";
const referenceDate = new Date("2026-10-15T00:00:00.000Z");
const collectedAt = new Date("2026-10-15T12:30:00.000Z");

function setup() {
  let run: Record<string, unknown> | null = null;
  let state: Record<string, unknown> = { id: stateId, userId, socialAccountId: accountId, scope: "account", status: "never_synced", leaseUntil: null, nextSyncAt: null };
  const accountInsightUpsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const mediaInsightUpsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const runCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    run = { id: runId, ...data };
    return run;
  });
  const runFindFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => where.id === runId && where.userId === userId && where.socialAccountId === accountId && run?.status === "running" ? run : null);
  const runUpdateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (where.id !== runId || run?.status !== "running") return { count: 0 };
    run = { ...run, ...data };
    return { count: 1 };
  });
  const stateUpdateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if ((where.id !== undefined && where.id !== stateId) || where.userId !== userId || where.socialAccountId !== accountId || where.scope !== state.scope || (where.lastRunId !== undefined && where.lastRunId !== state.lastRunId) || (where.status !== undefined && where.status !== state.status)) return { count: 0 };
    state = { ...state, ...data };
    return { count: 1 };
  });
  const tx = {
    instagramInsightSyncState: {
      updateMany: stateUpdateMany,
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state = { ...state, ...data }; return state; }),
    },
    instagramInsightSyncRun: { create: runCreate, findFirst: runFindFirst, updateMany: runUpdateMany },
    instagramAccountInsight: { upsert: accountInsightUpsert },
    instagramMediaInsight: { upsert: mediaInsightUpsert },
    instagramMediaPost: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] }; userId: string; socialAccountId: string; mediaType: string } }) => where.userId === userId && where.socialAccountId === accountId && where.mediaType === "CAROUSEL_ALBUM" && where.id.in.includes(postId) ? [{ id: postId }] : []) },
  };
  const db = {
    socialAccount: { findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string; status: string } }) => where.id === accountId && where.userId === userId && where.status === "connected" ? { id: accountId } : null) },
    instagramInsightSyncState: {
      upsert: vi.fn(async ({ where }: { where: { socialAccountId_scope: { socialAccountId: string; scope: string } } }) => {
        state = { ...state, ...where.socialAccountId_scope };
        return { id: stateId };
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => where.id === stateId ? state : null),
    },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { service: new InstagramInsightsPersistenceService(db), db, tx, run: () => run, state: () => state, accountInsightUpsert, mediaInsightUpsert, runFindFirst };
}

describe("InstagramInsightsPersistenceService", () => {
  it("persists zero as a real daily value with provenance and idempotent daily key", async () => {
    const state = setup();
    const started = await state.service.beginSync(userId, accountId, "account", "v26.0");
    expect(started.outcome).toBe("started");
    expect(started.run).toMatchObject({ requestedMetrics: ["reach"], source: "instagram_graph_api", apiVersion: "v26.0" });
    await state.service.finishSync(userId, accountId, runId, {
      status: "succeeded", collectedAt, accountMetrics: [{ metric: "reach", value: 0, referenceDate }],
    });
    expect(state.accountInsightUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { socialAccountId_metric_period_referenceDate: { socialAccountId: accountId, metric: "reach", period: "day", referenceDate } },
      create: expect.objectContaining({ value: 0, period: "day", collectedAt, source: "instagram_graph_api", apiVersion: "v26.0" }),
    }));
    expect(JSON.stringify(state.accountInsightUpsert.mock.calls)).not.toMatch(/token|secret/i);
    expect(state.run()).toMatchObject({ status: "succeeded", finishedAt: expect.any(Date) });
    expect(state.state()).toMatchObject({ status: "succeeded", leaseUntil: null, lastSuccessAt: expect.any(Date) });
  });

  it("records missing or unavailable metrics separately from zero without writing a value", async () => {
    const missing = setup();
    await missing.service.beginSync(userId, accountId, "account", "v26.0");
    await missing.service.finishSync(userId, accountId, runId, { status: "partial", collectedAt, missingMetrics: ["reach"] });
    expect(missing.accountInsightUpsert).not.toHaveBeenCalled();
    expect(missing.run()).toMatchObject({ missingMetrics: ["reach"], unavailableMetrics: {} });

    const unavailable = setup();
    await unavailable.service.beginSync(userId, accountId, "account", "v26.0");
    await unavailable.service.finishSync(userId, accountId, runId, { status: "partial", collectedAt, unavailableMetrics: { reach: "metric_unavailable" } });
    expect(unavailable.run()).toMatchObject({ missingMetrics: [], unavailableMetrics: { reach: "metric_unavailable" } });
    expect(unavailable.accountInsightUpsert).not.toHaveBeenCalled();
  });

  it("retains lifetime media observations per sync and refuses failed runs to replace snapshots", async () => {
    const state = setup();
    await state.service.beginSync(userId, accountId, "media", "v26.0");
    await state.service.finishSync(userId, accountId, runId, {
      status: "succeeded", collectedAt, mediaMetrics: [{ mediaPostId: postId, metric: "total_interactions", value: 0 }],
    });
    expect(state.mediaInsightUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { syncRunId_mediaPostId_metric_period: { syncRunId: runId, mediaPostId: postId, metric: "total_interactions", period: "lifetime" } },
      create: expect.objectContaining({ value: 0, mediaType: "CAROUSEL_ALBUM", period: "lifetime", referenceDate: new Date("2026-10-15T00:00:00.000Z"), collectedAt }),
    }));

    const failed = setup();
    await failed.service.beginSync(userId, accountId, "media", "v26.0");
    await failed.service.finishSync(userId, accountId, runId, { status: "failed", collectedAt, errorCode: "graph_timeout" });
    expect(failed.mediaInsightUpsert).not.toHaveBeenCalled();
    expect(failed.state()).toMatchObject({ status: "failed", lastErrorCode: "graph_timeout", lastSuccessAt: undefined });
  });

  it("rejects another user's account and prevents cross-account or unvalidated media types", async () => {
    const state = setup();
    await expect(state.service.beginSync(otherUserId, accountId, "account", "v26.0")).rejects.toThrow();
    await state.service.beginSync(userId, accountId, "media", "v26.0");
    await expect(state.service.finishSync(userId, accountId, runId, {
      status: "succeeded", collectedAt, mediaMetrics: [{ mediaPostId: imagePostId, metric: "reach", value: 2 }],
    })).rejects.toThrow(/CAROUSEL_ALBUM/);
    expect(state.mediaInsightUpsert).not.toHaveBeenCalled();
  });
});
