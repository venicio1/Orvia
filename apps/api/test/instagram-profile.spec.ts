import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { META_PROVIDER, SocialIntegrationsService } from "../src/modules/social-integrations/social-integrations.service";
import { encryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const userId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0001";
const accountId = "7cddc0c2-4dab-4b68-a26d-e0efcf720001";
const key = Buffer.alloc(32, 7).toString("base64");
const token = "page-profile-token";

function database(overrides: { claimCount?: number; ownerId?: string; priorSnapshot?: Record<string, unknown> | null } = {}) {
  let snapshot = overrides.priorSnapshot ?? null;
  let lastRun: Record<string, unknown> | null = null;
  const updateMany = vi.fn(async ({ where }: { where: { userId: string } }) => ({ count: where.userId === (overrides.ownerId ?? userId) ? (overrides.claimCount ?? 1) : 0 }));
  const runCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { lastRun = { id: "run-1", ...data }; return { id: "run-1" }; });
  const runUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { lastRun = { ...lastRun, ...data }; return lastRun; });
  const accountFindFirst = vi.fn(async ({ select }: { select: Record<string, unknown> }) => {
    if ("accessTokenCiphertext" in select) return { id: accountId, providerAccountId: "17841400000000001", accessTokenCiphertext: encryptMetaToken(token, key) };
    return { profileSnapshot: snapshot, profileReauthorizationRequired: false, syncRuns: lastRun ? [lastRun] : [] };
  });
  const snapshotUpsert = vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
    snapshot = { id: "snapshot-1", ...snapshot, ...create, ...update };
    return snapshot;
  });
  const transaction = {
    instagramProfileSnapshot: { upsert: snapshotUpsert, deleteMany: vi.fn(async () => ({ count: 0 })) },
    socialAccount: { updateMany: vi.fn(async () => ({ count: 1 })) },
    socialSyncRun: { create: runCreate, update: runUpdate },
  };
  const db = {
    socialAccount: { updateMany, findFirst: accountFindFirst },
    socialSyncRun: { create: runCreate, update: runUpdate },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  return { db, updateMany, accountFindFirst, runCreate, runUpdate, snapshotUpsert, getSnapshot: () => snapshot };
}

function configure() {
  vi.stubEnv("WEB_PUBLIC_URL", "http://localhost:3000");
  vi.stubEnv("META_APP_ID", "app");
  vi.stubEnv("META_APP_SECRET", "secret");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
  vi.stubEnv("META_REDIRECT_URI", "http://localhost:3000/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", key);
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Instagram profile snapshot", () => {
  it("reads the eight profile fields from the official Graph API using only the stored Page token", async () => {
    configure();
    const state = database();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init;
      return new Response(JSON.stringify({
      id: "17841400000000001", username: "unicstreetbr", name: "Unic Street", biography: "Perfil profissional",
      profile_picture_url: "https://scontent.cdninstagram.com/profile.jpg", followers_count: 1200, follows_count: 390,
      media_count: 88, website: "https://example.org",
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await new SocialIntegrationsService(state.db).syncProfile(userId, accountId);
    const requestUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    const requestInit = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(result.outcome).toBe("succeeded");
    expect(requestUrl.hostname).toBe("graph.facebook.com");
    expect(requestUrl.pathname).toBe("/v26.0/17841400000000001");
    expect(requestUrl.searchParams.get("fields")).toBe("id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,website");
    expect(requestUrl.searchParams.has("access_token")).toBe(false);
    expect(new Headers(requestInit.headers).get("authorization")).toBe("Bearer page-profile-token");
    expect(state.snapshotUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId, socialAccountId: accountId, username: "unicstreetbr", followersCount: 1200, source: "instagram_graph_api", apiVersion: "v26.0", returnedFields: expect.arrayContaining(["username", "website"]) }),
    }));
    expect(JSON.stringify(result)).not.toContain(token);
    expect(META_PROVIDER).toBe("instagram_facebook_login");
  });

  it("preserves missing, null, and zero as distinct provider facts", async () => {
    configure();
    const state = database();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "17841400000000001", username: null, followers_count: 0 }), { status: 200 })));
    await new SocialIntegrationsService(state.db).syncProfile(userId, accountId);
    const create = vi.mocked(state.snapshotUpsert).mock.calls[0]?.[0].create;
    expect(create).toMatchObject({ username: null, followersCount: 0, name: null, returnedFields: ["username", "followers_count"] });
    expect("followsCount" in create!).toBe(true);
  });

  it("keeps the previous snapshot after a Meta error and records only a safe error code", async () => {
    configure();
    const previous = { id: "snapshot-previous", userId, socialAccountId: accountId, username: "unicstreetbr", fetchedAt: new Date("2026-10-14T12:00:00Z") };
    const state = database({ priorSnapshot: previous });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: "sensitive provider text" } }), { status: 400 })));
    const result = await new SocialIntegrationsService(state.db).syncProfile(userId, accountId);
    expect(result.outcome).toBe("failed");
    expect(state.snapshotUpsert).not.toHaveBeenCalled();
    expect(state.getSnapshot()).toBe(previous);
    expect(state.runUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", errorCode: "token_invalid" }) }));
    expect(JSON.stringify(result)).not.toContain("sensitive provider text");
  });

  it("classifies Meta rate limiting and keeps the last valid snapshot", async () => {
    configure();
    const previous = { id: "snapshot-previous", userId, socialAccountId: accountId, username: "unicstreetbr", fetchedAt: new Date("2026-10-14T12:00:00Z") };
    const state = database({ priorSnapshot: previous });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 4, message: "rate limited" } }), { status: 429 })));
    const result = await new SocialIntegrationsService(state.db).syncProfile(userId, accountId);
    expect(result).toMatchObject({ outcome: "rate_limited", errorCode: "rate_limited" });
    expect(state.snapshotUpsert).not.toHaveBeenCalled();
    expect(state.getSnapshot()).toBe(previous);
  });

  it("serializes/rate-limits repeat requests and scopes the claim to the authenticated owner", async () => {
    configure();
    const state = database({ claimCount: 0 });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncProfile("another-user", accountId);
    expect(result.outcome).toBe("throttled");
    expect(state.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: accountId, userId: "another-user", provider: META_PROVIDER }) }));
    expect(fetch).not.toHaveBeenCalled();
    expect(state.accountFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: accountId, userId: "another-user", provider: META_PROVIDER } }));
  });

  it("does not persist malformed or mismatched Graph responses", async () => {
    configure();
    const state = database();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "other-account", username: "not-this-user" }), { status: 200 })));
    const result = await new SocialIntegrationsService(state.db).syncProfile(userId, accountId);
    expect(result.outcome).toBe("failed");
    expect(state.snapshotUpsert).not.toHaveBeenCalled();
    expect(state.runUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "profile_account_mismatch" }) }));
  });
});
