import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { META_PROVIDER, META_READ_SCOPES, SocialIntegrationsService } from "../src/modules/social-integrations/social-integrations.service";
import { decryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const userId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0001";
const sessionId = "d985a270-d7bd-47e4-baa2-a7d975100002";
const key = Buffer.alloc(32, 7).toString("base64");

function configuredEnvironment() {
  vi.stubEnv("WEB_PUBLIC_URL", "http://localhost:3000");
  vi.stubEnv("META_APP_ID", "test-app-id");
  vi.stubEnv("META_APP_SECRET", "test-app-secret");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "test-config-1836340137499916");
  vi.stubEnv("META_REDIRECT_URI", "http://localhost:3000/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_API_VERSION", "v99.0");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", key);
}

function fakeDatabase() {
  let attempt: Record<string, unknown> | null = null;
  const upsert = vi.fn(async (args: unknown) => ({ id: args ? "social-account-id" : "unused-id" }));
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const runCreate = vi.fn(async () => ({ id: "sync-run-id" }));
  const runUpdate = vi.fn(async () => ({ id: "sync-run-id" }));
  const snapshotDeleteMany = vi.fn(async () => ({ count: 0 }));
  const mediaAssetDeleteMany = vi.fn(async () => ({ count: 0 }));
  const mediaPostDeleteMany = vi.fn(async () => ({ count: 0 }));
  const mediaStateDeleteMany = vi.fn(async () => ({ count: 0 }));
  const db = {
    metaOAuthAttempt: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        attempt = { id: "oauth-attempt-id", ...data, consumedAt: null };
        return attempt;
      }),
      findUnique: vi.fn(async () => attempt),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (!attempt || attempt.userId !== where.userId || attempt.sessionId !== where.sessionId || !attempt.pageDiscoveryTokenCiphertext || attempt.pageDiscoveryConsumedAt || (attempt.pageDiscoveryAttempts as number) >= 5) return null;
        return attempt;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { attempt = { ...attempt!, ...data }; return attempt; }),
      updateMany: vi.fn(async ({ data }: { data?: Record<string, unknown> } = {}) => {
        if (!attempt) return { count: 0 };
        if (data?.consumedAt) {
          if (attempt.consumedAt) return { count: 0 };
          attempt = { ...attempt, consumedAt: data.consumedAt };
        } else if (data?.pageDiscoveryAttempts && typeof data.pageDiscoveryAttempts === "object") {
          attempt = { ...attempt, pageDiscoveryAttempts: (attempt.pageDiscoveryAttempts as number ?? 0) + 1 };
        } else if (data?.pageDiscoveryTokenCiphertext === null && attempt.pageDiscoveryExpiresAt instanceof Date && attempt.pageDiscoveryExpiresAt.getTime() < Date.now()) {
          attempt = { ...attempt, pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: data.pageDiscoveryConsumedAt };
        }
        return { count: 1 };
      }),
    },
    socialAccount: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      updateMany,
    },
    instagramProfileSnapshot: { deleteMany: snapshotDeleteMany },
    socialSyncRun: { create: runCreate, update: runUpdate },
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({ socialAccount: { upsert, updateMany }, socialSyncRun: { create: runCreate, update: runUpdate }, instagramProfileSnapshot: { deleteMany: snapshotDeleteMany }, instagramMediaAsset: { deleteMany: mediaAssetDeleteMany }, instagramMediaPost: { deleteMany: mediaPostDeleteMany }, instagramMediaSyncState: { deleteMany: mediaStateDeleteMany } })),
  } as unknown as PrismaService;
  const transaction = async (callback: (transaction: unknown) => unknown) => callback({
    socialAccount: { upsert, updateMany }, socialSyncRun: { create: runCreate, update: runUpdate }, instagramProfileSnapshot: { deleteMany: snapshotDeleteMany }, instagramMediaAsset: { deleteMany: mediaAssetDeleteMany }, instagramMediaPost: { deleteMany: mediaPostDeleteMany }, instagramMediaSyncState: { deleteMany: mediaStateDeleteMany }, metaOAuthAttempt: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { attempt = { ...attempt!, ...data }; return attempt; }) },
  });
  (db as unknown as { $transaction: typeof transaction }).$transaction = vi.fn(transaction);
  return { db, upsert, runCreate, mediaAssetDeleteMany, mediaPostDeleteMany, mediaStateDeleteMany };
}

function metaResponses() {
  const pages = [{ id: "page-1", name: "Consultório", access_token: "page-access-token", instagram_business_account: { id: "ig-1", username: "psico.teste" } }];
  return [
    { access_token: "short-lived-user-token", expires_in: 3600 },
    { access_token: "long-lived-user-token", expires_in: 5_184_000 },
    { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
    { data: pages },
  ];
}

function stubMetaFetch(responses: unknown[]) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    const result = responses.shift();
    return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Meta social connection foundation", () => {
  it("reports Meta unavailable until backend configuration is complete", async () => {
    vi.stubEnv("META_APP_ID", ""); vi.stubEnv("META_APP_SECRET", ""); vi.stubEnv("META_LOGIN_CONFIG_ID", ""); vi.stubEnv("META_REDIRECT_URI", "");
    vi.stubEnv("META_GRAPH_API_VERSION", ""); vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "");
    const { db } = fakeDatabase();
    const service = new SocialIntegrationsService(db);
    const result = await service.status(userId);
    expect(result.configured).toBe(false);
    expect(result.accounts).toEqual([]);
    expect(result.requiredScopes).toEqual(["pages_show_list", "instagram_basic", "pages_read_engagement"]);
  });

  it("creates a short-lived session-bound OAuth state and requests only the read scopes", async () => {
    configuredEnvironment();
    const { db } = fakeDatabase();
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const url = new URL(started.authorizationUrl);
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v99.0/dialog/oauth");
    expect(url.searchParams.get("config_id")).toBe("test-config-1836340137499916");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("client_secret")).toBeNull();
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(db.metaOAuthAttempt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId, sessionId, expiresAt: expect.any(Date) }) }));
  });

  it("does not call Meta when OAuth state does not belong to the current attempt", async () => {
    configuredEnvironment();
    const { db } = fakeDatabase();
    const fetch = stubMetaFetch([]);
    const result = await new SocialIntegrationsService(db).complete(userId, sessionId, "untrusted_state", "code");
    expect(result).toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("exchanges a valid code, checks granted scopes, stores only encrypted page tokens, and consumes state once", async () => {
    configuredEnvironment();
    const { db, upsert, runCreate } = fakeDatabase();
    const fetch = stubMetaFetch(metaResponses());
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;

    const result = await service.complete(userId, sessionId, state, "authorization-code");
    expect(result).toBe("connected");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_provider_providerAccountId: { userId, provider: META_PROVIDER, providerAccountId: "ig-1" } },
      create: expect.objectContaining({ pageId: "page-1", username: "psico.teste", grantedScopes: [...META_READ_SCOPES], status: "connected" }),
    }));
    const createData = vi.mocked(upsert).mock.calls[0]?.[0] as unknown as { create: { accessTokenCiphertext: string } };
    expect(createData.create.accessTokenCiphertext).not.toContain("page-access-token");
    expect(decryptMetaToken(createData.create.accessTokenCiphertext, key)).toBe("page-access-token");
    expect(runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "succeeded", recordsRead: 1 }) }));
    expect(await service.complete(userId, sessionId, state, "authorization-code")).toBe("invalid_state");
  });

  it("does not store an account when any required scope was not granted", async () => {
    configuredEnvironment();
    const { db, upsert, runCreate } = fakeDatabase();
    stubMetaFetch([{ access_token: "short", expires_in: 3600 }, { access_token: "long", expires_in: 3600 }, { data: [{ permission: "pages_show_list", status: "granted" }] }]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    expect(await service.complete(userId, sessionId, state, "authorization-code")).toBe("missing_permissions");
    expect(upsert).not.toHaveBeenCalled();
    expect(runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", errorCode: "required_scope_missing" }) }));
  });

  it("distinguishes an empty accessible Page list from Pages without a linked professional Instagram", async () => {
    configuredEnvironment();
    const noPageDb = fakeDatabase();
    stubMetaFetch([
      { access_token: "short" }, { access_token: "long" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { data: [] },
    ]);
    const noPageService = new SocialIntegrationsService(noPageDb.db);
    const noPageStart = await noPageService.begin(userId, sessionId);
    const noPageState = new URL(noPageStart.authorizationUrl).searchParams.get("state")!;
    expect(await noPageService.complete(userId, sessionId, noPageState, "authorization-code")).toBe("page_id_required");
    expect(noPageDb.runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "no_accessible_pages", recordsRead: 0 }) }));

    configuredEnvironment();
    const unlinkedDb = fakeDatabase();
    stubMetaFetch([
      { access_token: "short" }, { access_token: "long" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { data: [{ id: "page-only", name: "private test page", access_token: "page-token" }] },
    ]);
    const unlinkedService = new SocialIntegrationsService(unlinkedDb.db);
    const unlinkedStart = await unlinkedService.begin(userId, sessionId);
    const unlinkedState = new URL(unlinkedStart.authorizationUrl).searchParams.get("state")!;
    expect(await unlinkedService.complete(userId, sessionId, unlinkedState, "authorization-code")).toBe("pages_without_instagram");
    expect(unlinkedDb.runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "pages_without_instagram_account", recordsRead: 1 }) }));
  });

  it("uses an encrypted, session-bound Page ID fallback and stores only the Page token after Meta proves access", async () => {
    configuredEnvironment();
    const { db, upsert, runCreate } = fakeDatabase();
    const fetch = stubMetaFetch([
      { access_token: "short-user-token" }, { access_token: "long-user-token" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) }, { data: [] },
      { id: "1234567890123456", name: "Page", access_token: "page-access-token", instagram_business_account: { id: "ig-account", username: "conta_teste" } },
    ]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    expect(await service.complete(userId, sessionId, state, "authorization-code")).toBe("page_id_required");
    const result = await service.connectPageById(userId, sessionId, "1234567890123456");
    expect(result.outcome).toBe("connected");
    expect(fetch).toHaveBeenCalledTimes(5);
    const pageRequest = new URL(String(fetch.mock.calls[4]?.[0]));
    expect(pageRequest.pathname).toMatch(/\/1234567890123456$/);
    expect(pageRequest.searchParams.get("fields")).toContain("access_token");
    expect(pageRequest.searchParams.get("access_token")).toBe("long-user-token");
    const upsertArgs = upsert.mock.calls[0]?.[0] as { create: { accessTokenCiphertext: string } };
    expect(decryptMetaToken(upsertArgs.create.accessTokenCiphertext, key)).toBe("page-access-token");
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: "oauth_page_id_discovery", status: "succeeded" }) }));
  });

  it("does not treat public Page fields or a linked Instagram alone as authorization", async () => {
    configuredEnvironment();
    const { db, upsert } = fakeDatabase();
    stubMetaFetch([
      { access_token: "short-user-token" }, { access_token: "long-user-token" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) }, { data: [] },
      { id: "1234567890123456", name: "Public page", instagram_business_account: { id: "ig-account", username: "public-profile" } },
    ]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    await service.complete(userId, sessionId, state, "authorization-code");
    expect((await service.connectPageById(userId, sessionId, "1234567890123456")).outcome).toBe("page_not_authorized");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps the pending OAuth token scoped to the originating Orvia user and session", async () => {
    configuredEnvironment();
    const { db } = fakeDatabase();
    const fetch = stubMetaFetch([
      { access_token: "short-user-token" }, { access_token: "long-user-token" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) }, { data: [] },
    ]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    await service.complete(userId, sessionId, state, "authorization-code");
    expect(await service.connectPageById("another-user", sessionId, "1234567890123456")).toEqual({ outcome: "page_discovery_expired" });
    expect(await service.connectPageById(userId, "another-session", "1234567890123456")).toEqual({ outcome: "page_discovery_expired" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rejects malformed Page IDs before any Graph request", async () => {
    configuredEnvironment();
    const { db } = fakeDatabase();
    const fetch = stubMetaFetch([]);
    await expect(new SocialIntegrationsService(db).connectPageById(userId, sessionId, "https://facebook.com/page")).rejects.toThrow("invalid_page_id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("classifies Graph API errors separately and never labels them as an empty account list", async () => {
    configuredEnvironment();
    const { db, runCreate } = fakeDatabase();
    stubMetaFetch([
      { access_token: "short" }, { access_token: "long" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { error: { code: 999, message: "not exposed" } },
    ]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    expect(await service.complete(userId, sessionId, state, "authorization-code")).toBe("graph_api_error");
    expect(runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorCode: "graph_http_200", recordsRead: 0 }) }));
  });

  it("walks Facebook Page cursors without trusting provider-supplied next URLs", async () => {
    configuredEnvironment();
    const { db, upsert } = fakeDatabase();
    const fetch = stubMetaFetch([
      { access_token: "short-lived-user-token" },
      { access_token: "long-lived-user-token" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { data: [{ id: "page-1", access_token: "page-token-1", instagram_business_account: { id: "ig-1", username: "um" } }], paging: { next: "https://not-followed.example/anything", cursors: { after: "opaque-next-cursor" } } },
      { data: [{ id: "page-2", access_token: "page-token-2", instagram_business_account: { id: "ig-2", username: "dois" } }] },
    ]);
    const service = new SocialIntegrationsService(db);
    const started = await service.begin(userId, sessionId);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    expect(await service.complete(userId, sessionId, state, "authorization-code")).toBe("connected");
    expect(fetch).toHaveBeenCalledTimes(5);
    const secondPagesRequest = new URL(String(fetch.mock.calls[4]?.[0]));
    expect(secondPagesRequest.hostname).toBe("graph.facebook.com");
    expect(secondPagesRequest.searchParams.get("after")).toBe("opaque-next-cursor");
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("clears encrypted credentials when disconnecting and scopes every mutation by user", async () => {
    const { db, mediaAssetDeleteMany, mediaPostDeleteMany, mediaStateDeleteMany } = fakeDatabase();
    const result = await new SocialIntegrationsService(db).disconnect(userId, "social-account-id");
    expect(result.message).toContain("credencial armazenada foi apagada");
    expect(db.socialAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "social-account-id", userId, provider: META_PROVIDER, status: { not: "disconnected" } },
      data: expect.objectContaining({ accessTokenCiphertext: null, grantedScopes: [], status: "disconnected" }),
    }));
    expect(db.socialSyncRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: "disconnect", status: "succeeded" }) }));
    expect(mediaAssetDeleteMany).toHaveBeenCalledWith({ where: { socialAccountId: "social-account-id", userId } });
    expect(mediaPostDeleteMany).toHaveBeenCalledWith({ where: { socialAccountId: "social-account-id", userId } });
    expect(mediaStateDeleteMany).toHaveBeenCalledWith({ where: { socialAccountId: "social-account-id", userId } });
  });
});
