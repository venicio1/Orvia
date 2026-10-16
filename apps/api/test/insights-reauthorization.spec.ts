import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { META_INSIGHTS_SCOPE, META_PROVIDER, META_READ_SCOPES, SocialIntegrationsService } from "../src/modules/social-integrations/social-integrations.service";
import { decryptMetaToken, encryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const userId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0001";
const sessionId = "d985a270-d7bd-47e4-baa2-a7d975100002";
const accountId = "b43f21e5-485a-4d67-84c7-9a8d8b0c0002";
const pageId = "1293109680562847";
const instagramId = "17841400000000001";
const key = Buffer.alloc(32, 7).toString("base64");
const oldToken = "previous-page-token-test-fixture";
const newPageToken = "replacement-page-token-test-fixture";
const oauthCode = "one-time-oauth-code-test-fixture";

function env() {
  vi.stubEnv("WEB_PUBLIC_URL", "http://localhost:3000");
  vi.stubEnv("META_APP_ID", "test-app-id");
  vi.stubEnv("META_APP_SECRET", "test-app-secret");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "primary-config");
  vi.stubEnv("META_INSIGHTS_LOGIN_CONFIG_ID", "insights-config");
  vi.stubEnv("META_REDIRECT_URI", "http://localhost:3000/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", key);
}

function setup() {
  let attempt: (Record<string, unknown> & { id: string; expiresAt: Date; consumedAt: Date | null; stateHash: string; userId: string; sessionId: string }) | null = null;
  let account = {
    id: accountId, userId, provider: META_PROVIDER, status: "connected", pageId, providerAccountId: instagramId,
    accessTokenCiphertext: encryptMetaToken(oldToken, key), grantedScopes: [...META_READ_SCOPES], tokenExpiresAt: null,
  };
  const findAccount = vi.fn(async ({ where }: { where: Record<string, unknown> }) => where.id === accountId && where.userId === userId ? { ...account } : null);
  const accountUpdateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const matches = where.id === account.id && where.userId === account.userId && where.provider === account.provider && where.status === account.status
      && where.pageId === account.pageId && where.providerAccountId === account.providerAccountId && where.accessTokenCiphertext === account.accessTokenCiphertext;
    if (!matches) return { count: 0 };
    account = { ...account, ...data } as typeof account;
    return { count: 1 };
  });
  const runCreate = vi.fn(async () => ({ id: "run-id" }));
  const attemptCreate = vi.fn(async ({ data }: { data: Record<string, unknown> & { id?: string; expiresAt: Date; stateHash: string; userId: string; sessionId: string } }) => {
    attempt = { id: "attempt-id", ...data, consumedAt: null };
    return attempt;
  });
  const attemptUpdateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (!attempt || attempt.id !== where.id || attempt.userId !== where.userId || attempt.sessionId !== where.sessionId || attempt.consumedAt || attempt.expiresAt <= new Date()) return { count: 0 };
    attempt = { ...attempt, ...data };
    return { count: 1 };
  });
  const db = {
    metaOAuthAttempt: {
      create: attemptCreate,
      findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) => attempt?.stateHash === where.stateHash ? attempt : null),
      updateMany: attemptUpdateMany,
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { attempt = { ...attempt!, ...data }; return attempt; }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    socialAccount: { findFirst: findAccount, findMany: vi.fn(async () => []), updateMany: accountUpdateMany },
    socialSyncRun: { create: runCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ socialAccount: { updateMany: accountUpdateMany }, socialSyncRun: { create: runCreate } })),
  } as unknown as PrismaService;
  return {
    db, findAccount, attemptCreate, attemptUpdateMany, accountUpdateMany, runCreate,
    currentAccount: () => account, currentAttempt: () => attempt,
    setCiphertext: (value: string) => { account = { ...account, accessTokenCiphertext: value }; },
  };
}

function successfulMetaResponses(pageList: unknown = [{ id: pageId, name: "Página autorizada", access_token: newPageToken, instagram_business_account: { id: instagramId, username: "orvia_teste" } }]) {
  return [
    { access_token: "short-user-token-test-fixture" },
    { access_token: "long-user-token-test-fixture" },
    { data: [...META_READ_SCOPES, META_INSIGHTS_SCOPE].map(permission => ({ permission, status: "granted" })) },
    { data: pageList },
  ];
}

function stubResponses(responses: Array<unknown | (() => unknown)>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input; void init;
    const queued = responses.shift();
    const next = typeof queued === "function" ? queued() : queued;
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function start(service: SocialIntegrationsService) {
  const result = await service.beginInsightsReauthorization(userId, sessionId, accountId);
  const url = new URL(result.authorizationUrl);
  return { state: url.searchParams.get("state")!, url };
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Meta Instagram Insights OAuth reauthorization", () => {
  it("uses the dedicated config and atomically replaces the same account token after successful validation", async () => {
    env();
    const state = setup();
    const fetch = stubResponses(successfulMetaResponses());
    const service = new SocialIntegrationsService(state.db);
    const started = await start(service);
    expect(started.url.searchParams.get("config_id")).toBe("insights-config");
    expect(started.url.searchParams.has("scope")).toBe(false);
    expect(started.url.searchParams.has("client_secret")).toBe(false);
    expect(state.attemptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId, sessionId, intent: "insights_reauthorization", targetSocialAccountId: accountId,
      expectedPageId: pageId, expectedInstagramAccountId: instagramId,
    }) }));

    expect(await service.complete("another-user", sessionId, started.state, oauthCode)).toBe("invalid_state");
    expect(await service.complete(userId, "another-session", started.state, oauthCode)).toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(await service.complete(userId, sessionId, started.state, oauthCode)).toBe("insights_reauthorized");
    const current = state.currentAccount();
    expect(current.id).toBe(accountId);
    expect(current.grantedScopes).toEqual([...META_READ_SCOPES, META_INSIGHTS_SCOPE]);
    expect(current.accessTokenCiphertext).not.toBe(encryptMetaToken(oldToken, key));
    expect(decryptMetaToken(current.accessTokenCiphertext, key)).toBe(newPageToken);
    expect(state.accountUpdateMany).toHaveBeenCalledTimes(1);
    expect(state.accountUpdateMany.mock.calls[0]?.[0]).toMatchObject({ where: { id: accountId, userId, pageId, providerAccountId: instagramId } });
    expect(state.runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operation: "oauth_insights_reauthorization", status: "succeeded" }) }));
    expect(JSON.stringify({ result: "insights_reauthorized", account: { id: current.id, scopes: current.grantedScopes } })).not.toContain(newPageToken);
    for (const [input] of fetch.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(url.searchParams.has("client_secret")).toBe(false);
      expect(url.searchParams.has("code")).toBe(false);
    }
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(String(fetch.mock.calls[0]?.[1]?.body)).toContain(oauthCode);
  });

  it("keeps the previous token when instagram_manage_insights was not granted", async () => {
    env();
    const state = setup();
    stubResponses([
      { access_token: "short-user-token" }, { access_token: "long-user-token" },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
    ]);
    const service = new SocialIntegrationsService(state.db);
    const started = await start(service);
    expect(await service.complete(userId, sessionId, started.state, oauthCode)).toBe("insights_missing_permissions");
    expect(state.accountUpdateMany).not.toHaveBeenCalled();
    expect(decryptMetaToken(state.currentAccount().accessTokenCiphertext, key)).toBe(oldToken);
  });

  it("rejects invalid, expired and reused state before calling Meta", async () => {
    env();
    const state = setup();
    const fetch = stubResponses([]);
    const service = new SocialIntegrationsService(state.db);
    expect(await service.complete(userId, sessionId, "invalid-state", oauthCode)).toBe("invalid_state");
    const expired = await start(service);
    state.currentAttempt()!.expiresAt = new Date(Date.now() - 1);
    expect(await service.complete(userId, sessionId, expired.state, oauthCode)).toBe("invalid_state");
    const once = await start(service);
    state.currentAttempt()!.expiresAt = new Date(Date.now() + 60_000);
    expect(await service.complete(userId, sessionId, once.state, "", "access_denied")).toBe("insights_denied");
    expect(await service.complete(userId, sessionId, once.state, oauthCode)).toBe("invalid_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(state.accountUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects Page or Instagram identity mismatches without updating stored data", async () => {
    const mismatchedPages = [
      [{ id: "different-page-id", access_token: newPageToken, instagram_business_account: { id: instagramId } }],
      [{ id: pageId, access_token: newPageToken, instagram_business_account: { id: "different-instagram-id" } }],
    ];
    for (const pages of mismatchedPages) {
      env();
      const state = setup();
      stubResponses(successfulMetaResponses(pages));
      const service = new SocialIntegrationsService(state.db);
      const started = await start(service);
      expect(await service.complete(userId, sessionId, started.state, oauthCode)).toBe("insights_account_mismatch");
      expect(state.accountUpdateMany).not.toHaveBeenCalled();
      expect(decryptMetaToken(state.currentAccount().accessTokenCiphertext, key)).toBe(oldToken);
    }
  });

  it("uses the already stored Page ID when /me/accounts is empty", async () => {
    env();
    const state = setup();
    const fetch = stubResponses([
      ...successfulMetaResponses([]).slice(0, 3), { data: [] },
      { id: pageId, name: "Página autorizada", access_token: newPageToken, instagram_business_account: { id: instagramId, username: "orvia_teste" } },
    ]);
    const service = new SocialIntegrationsService(state.db);
    const started = await start(service);
    expect(await service.complete(userId, sessionId, started.state, oauthCode)).toBe("insights_reauthorized");
    expect(new URL(String(fetch.mock.calls[4]?.[0])).pathname).toMatch(new RegExp(`/${pageId}$`));
    expect(fetch.mock.calls[4]?.[1]?.headers).toMatchObject({ authorization: "Bearer long-user-token-test-fixture" });
  });

  it("preserves the old credential on cancellation and Graph API failure", async () => {
    env();
    const cancelled = setup();
    const cancelService = new SocialIntegrationsService(cancelled.db);
    const cancelAttempt = await start(cancelService);
    const fetch = stubResponses([]);
    expect(await cancelService.complete(userId, sessionId, cancelAttempt.state, undefined, "access_denied")).toBe("insights_denied");
    expect(fetch).not.toHaveBeenCalled();
    expect(decryptMetaToken(cancelled.currentAccount().accessTokenCiphertext, key)).toBe(oldToken);

    env();
    const failed = setup();
    stubResponses([new Error("transport detail with private fixture")]);
    const failedService = new SocialIntegrationsService(failed.db);
    const failedAttempt = await start(failedService);
    expect(await failedService.complete(userId, sessionId, failedAttempt.state, oauthCode)).toBe("insights_failed");
    expect(failed.accountUpdateMany).not.toHaveBeenCalled();
    expect(decryptMetaToken(failed.currentAccount().accessTokenCiphertext, key)).toBe(oldToken);
  });

  it("does not authorize a different user or overwrite an account changed concurrently", async () => {
    env();
    const unauthorized = setup();
    const service = new SocialIntegrationsService(unauthorized.db);
    await expect(service.beginInsightsReauthorization("another-user", sessionId, accountId)).rejects.toMatchObject({ response: { code: "social_account_not_found" } });

    env();
    const changed = setup();
    const fetch = stubResponses([
      ...successfulMetaResponses().slice(0, 3),
      () => { changed.setCiphertext(encryptMetaToken("concurrent-token", key)); return { data: [{ id: pageId, name: "Página autorizada", access_token: newPageToken, instagram_business_account: { id: instagramId } }] }; },
    ]);
    const changedService = new SocialIntegrationsService(changed.db);
    const started = await start(changedService);
    expect(await changedService.complete(userId, sessionId, started.state, oauthCode)).toBe("insights_failed");
    expect(decryptMetaToken(changed.currentAccount().accessTokenCiphertext, key)).toBe("concurrent-token");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
