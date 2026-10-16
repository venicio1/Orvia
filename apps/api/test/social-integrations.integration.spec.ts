import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/database/prisma.service";
import { META_READ_SCOPES, SocialIntegrationsService } from "../src/modules/social-integrations/social-integrations.service";
import { decryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const enabled = process.env.RUN_DB_INTEGRATION === "1";
describe.skipIf(!enabled)("Meta connection persistence and ownership (PostgreSQL)", () => {
  const db = new PrismaService();
  const emails = [randomUUID(), randomUUID()].map(value => `${value}@orvia-test.local`);
  const userIds: string[] = [];
  const social = new SocialIntegrationsService(db);
  const key = Buffer.alloc(32, 13).toString("base64");

  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => {
    if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.onModuleDestroy();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("persists an OAuth-linked account with encrypted token and allows only its owner to disconnect", async () => {
    vi.stubEnv("WEB_PUBLIC_URL", "http://localhost:3000");
    vi.stubEnv("META_APP_ID", "test-app-id");
    vi.stubEnv("META_APP_SECRET", "test-app-secret");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "test-config-id");
    vi.stubEnv("META_REDIRECT_URI", "http://localhost:3000/api/integrations/meta/callback");
    vi.stubEnv("META_GRAPH_API_VERSION", "v99.0");
    vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", key);
    const [first, second] = await Promise.all(emails.map(email => db.user.create({ data: { email, passwordHash: "test-only-hash", emailVerifiedAt: new Date(), profile: { create: {} } } })));
    userIds.push(first.id, second.id);
    const session = await db.session.create({ data: { userId: first.id, tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "a"), csrfHash: randomUUID().replaceAll("-", "").padEnd(64, "b"), expiresAt: new Date(Date.now() + 60_000) } });
    await expect(db.metaOAuthAttempt.create({ data: { userId: second.id, sessionId: session.id, stateHash: randomUUID().replaceAll("-", "").padEnd(64, "c"), expiresAt: new Date(Date.now() + 60_000) } })).rejects.toMatchObject({ code: "P2003" });
    const responses = [
      { access_token: "short-lived-user-token", expires_in: 3600 },
      { access_token: "long-lived-user-token", expires_in: 3600 },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { data: [{ id: "111111111111111", name: "Conta de teste", access_token: "page-token-for-test", instagram_business_account: { id: "17841400000000001", username: "orvia.qa" } }] },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } })));

    const started = await social.begin(first.id, session.id);
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    expect(await social.complete(first.id, session.id, state, "test-authorization-code")).toBe("connected");

    const account = await db.socialAccount.findUniqueOrThrow({ where: { userId_provider_providerAccountId: { userId: first.id, provider: "instagram_facebook_login", providerAccountId: "17841400000000001" } } });
    expect(account.status).toBe("connected");
    expect(account.grantedScopes).toEqual([...META_READ_SCOPES]);
    expect(account.accessTokenCiphertext).not.toContain("page-token-for-test");
    expect(decryptMetaToken(account.accessTokenCiphertext!, key)).toBe("page-token-for-test");
    expect(await db.socialSyncRun.count({ where: { userId: first.id, socialAccountId: account.id, status: "succeeded" } })).toBe(1);
    await expect(db.socialSyncRun.create({ data: { userId: second.id, socialAccountId: account.id, provider: "instagram_facebook_login", operation: "ownership_probe", status: "succeeded" } })).rejects.toMatchObject({ code: "P2003" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "17841400000000001", username: "orvia.qa", name: "Orvia QA", biography: "Conta de teste", followers_count: 0, follows_count: 0, media_count: 0, website: null }), { status: 200, headers: { "content-type": "application/json" } })));
    const profileSync = await social.syncProfile(first.id, account.id);
    expect(profileSync.outcome).toBe("succeeded");
    const profileSnapshot = await db.instagramProfileSnapshot.findUniqueOrThrow({ where: { socialAccountId: account.id } });
    expect(profileSnapshot).toMatchObject({ userId: first.id, socialAccountId: account.id, username: "orvia.qa", followersCount: 0, source: "instagram_graph_api", apiVersion: "v99.0", returnedFields: expect.arrayContaining(["username", "followers_count"]) });
    expect((await social.syncProfile(second.id, account.id)).outcome).toBe("throttled");
    expect(await db.instagramProfileSnapshot.findFirst({ where: { socialAccountId: account.id, userId: second.id } })).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      { id: "test-image", media_type: "IMAGE", caption: "fixture only", media_url: "https://scontent.cdninstagram.com/fixture.jpg" },
      { id: "test-carousel", media_type: "CAROUSEL_ALBUM", children: { data: [{ id: "test-child", media_type: "IMAGE" }] } },
    ] }), { status: 200, headers: { "content-type": "application/json" } })));
    const mediaSync = await social.syncMediaPage(first.id, account.id, "refresh");
    expect(mediaSync).toMatchObject({ outcome: "succeeded", storedCount: 2, sync: { status: "succeeded", pagesRead: 1 } });
    const storedMedia = await db.instagramMediaPost.findMany({ where: { userId: first.id, socialAccountId: account.id }, include: { assets: true } });
    expect(storedMedia).toHaveLength(2);
    expect(storedMedia.find(item => item.providerMediaId === "test-carousel")?.assets).toHaveLength(1);
    expect(await db.instagramMediaSyncState.findUniqueOrThrow({ where: { socialAccountId: account.id } })).toMatchObject({ userId: first.id, status: "succeeded", storedCount: 2, source: "instagram_graph_api" });

    vi.stubEnv("META_INSIGHTS_LOGIN_CONFIG_ID", "test-insights-config-id");
    const reauthorizationResponses = [
      { access_token: "reauthorization-short-user-token" },
      { access_token: "reauthorization-long-user-token" },
      { data: [...META_READ_SCOPES, "instagram_manage_insights"].map(permission => ({ permission, status: "granted" })) },
      { data: [{ id: "111111111111111", name: "Conta de teste", access_token: "reauthorized-page-token", instagram_business_account: { id: "17841400000000001", username: "orvia.qa" } }] },
    ];
    const reauthorizationFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify(reauthorizationResponses.shift()), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", reauthorizationFetch);
    const profileBeforeReauthorization = await db.instagramProfileSnapshot.findUniqueOrThrow({ where: { socialAccountId: account.id } });
    const postsBeforeReauthorization = await db.instagramMediaPost.count({ where: { userId: first.id, socialAccountId: account.id } });
    const insightAuth = await social.beginInsightsReauthorization(first.id, session.id, account.id);
    const insightState = new URL(insightAuth.authorizationUrl).searchParams.get("state")!;
    expect(new URL(insightAuth.authorizationUrl).searchParams.get("config_id")).toBe("test-insights-config-id");
    expect(await social.complete(first.id, session.id, insightState, "test-insights-authorization-code")).toBe("insights_reauthorized");
    const reauthorizedAccount = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(reauthorizedAccount.id).toBe(account.id);
    expect(reauthorizedAccount.grantedScopes).toEqual([...META_READ_SCOPES, "instagram_manage_insights"]);
    expect(decryptMetaToken(reauthorizedAccount.accessTokenCiphertext!, key)).toBe("reauthorized-page-token");
    expect(await db.instagramProfileSnapshot.findUniqueOrThrow({ where: { socialAccountId: account.id } })).toEqual(profileBeforeReauthorization);
    expect(await db.instagramMediaPost.count({ where: { userId: first.id, socialAccountId: account.id } })).toBe(postsBeforeReauthorization);
    for (const [input] of reauthorizationFetch.mock.calls) {
      const url = new URL(String(input));
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(url.searchParams.has("client_secret")).toBe(false);
      expect(url.searchParams.has("code")).toBe(false);
    }

    await expect(db.instagramMediaPost.create({ data: {
      userId: second.id, socialAccountId: account.id, providerMediaId: "cross-user-post", mediaType: "IMAGE",
      source: "instagram_graph_api", apiVersion: "v99.0", fetchedAt: new Date(),
    } })).rejects.toMatchObject({ code: "P2003" });
    expect(await social.listMedia(second.id, account.id).catch(() => null)).toBeNull();

    await db.socialAccount.update({ where: { id: account.id }, data: { mediaSyncLastAttemptAt: null, mediaSyncLeaseUntil: null } });
    const concurrentFetch = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", concurrentFetch);
    const concurrent = await Promise.all([
      social.syncMediaPage(first.id, account.id, "refresh"),
      social.syncMediaPage(first.id, account.id, "refresh"),
    ]);
    expect(concurrent.map(result => result.outcome).sort()).toEqual(["succeeded", "throttled"]);
    expect(concurrentFetch).toHaveBeenCalledTimes(1);

    await expect(social.disconnect(second.id, account.id)).rejects.toMatchObject({ response: { code: "social_account_not_found" } });

    const fallbackResponses = [
      { access_token: "short-fallback-user-token", expires_in: 3600 },
      { access_token: "long-fallback-user-token", expires_in: 3600 },
      { data: META_READ_SCOPES.map(permission => ({ permission, status: "granted" })) },
      { data: [] },
      { id: "1234567890123456", name: "Conta de teste", access_token: "page-token-from-fallback", instagram_business_account: { id: "17841400000000001", username: "orvia.qa" } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fallbackResponses.shift()), { status: 200, headers: { "content-type": "application/json" } })));
    const fallbackStart = await social.begin(first.id, session.id);
    const fallbackState = new URL(fallbackStart.authorizationUrl).searchParams.get("state")!;
    expect(await social.complete(first.id, session.id, fallbackState, "test-fallback-authorization-code")).toBe("page_id_required");
    const pending = await db.metaOAuthAttempt.findFirstOrThrow({ where: { userId: first.id, sessionId: session.id, pageDiscoveryTokenCiphertext: { not: null } } });
    expect(pending.pageDiscoveryTokenCiphertext).not.toContain("long-fallback-user-token");
    expect(decryptMetaToken(pending.pageDiscoveryTokenCiphertext!, key)).toBe("long-fallback-user-token");
    expect(await social.connectPageById(first.id, session.id, "1234567890123456")).toMatchObject({ outcome: "connected" });
    const consumed = await db.metaOAuthAttempt.findUniqueOrThrow({ where: { id: pending.id } });
    expect(consumed.pageDiscoveryTokenCiphertext).toBeNull();
    const fallbackAccount = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(decryptMetaToken(fallbackAccount.accessTokenCiphertext!, key)).toBe("page-token-from-fallback");

    await social.disconnect(first.id, account.id);
    const disconnected = await db.socialAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(disconnected).toMatchObject({ status: "disconnected", accessTokenCiphertext: null, grantedScopes: [] });
    expect(await db.instagramProfileSnapshot.findUnique({ where: { socialAccountId: account.id } })).toBeNull();
    expect(await db.instagramMediaPost.findMany({ where: { socialAccountId: account.id } })).toHaveLength(0);
    expect(await db.instagramMediaSyncState.findUnique({ where: { socialAccountId: account.id } })).toBeNull();
  });
});
