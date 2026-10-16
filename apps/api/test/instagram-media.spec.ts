import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/database/prisma.service";
import { SocialIntegrationsService } from "../src/modules/social-integrations/social-integrations.service";
import { encryptMetaToken } from "../src/modules/social-integrations/token-crypto";

const userId = "b44f21e5-485a-4d67-84c7-9a8d8b0c0001";
const accountId = "7cddc0c2-4dab-4b68-a26d-e0efcf720001";
const token = "page-media-token-test-only";
const key = Buffer.alloc(32, 7).toString("base64");

type TestAsset = { id: string; userId: string; socialAccountId: string; parentPostId: string; providerMediaId: string; position: number; mediaType: string; mediaUrl: string | null; thumbnailUrl: string | null; returnedFields: string[] };
type TestPost = { id: string; userId: string; socialAccountId: string; providerMediaId: string; mediaType: string; caption?: string | null; publishedAt?: Date | null; permalink?: string | null; mediaProductType?: string | null; mediaUrl?: string | null; thumbnailUrl?: string | null; returnedFields?: string[]; assets?: TestAsset[] };

function database(options: { ownerId?: string; priorPosts?: TestPost[]; hasMore?: boolean; nextCursor?: string | null; claimCount?: number } = {}) {
  const posts: TestPost[] = [...(options.priorPosts ?? [])];
  const assets: TestAsset[] = [];
  const state: Record<string, unknown> = { userId, socialAccountId: accountId, status: "never_synced", hasMore: options.hasMore ?? false, nextCursor: options.nextCursor ?? null, unavailableFields: [], requestedFields: [], storedCount: posts.length, recordsRead: 0, pagesRead: 0 };
  const run = { id: "run-1" };
  const account = {
    id: accountId, providerAccountId: "17841400000000001", accessTokenCiphertext: encryptMetaToken(token, key),
    mediaReauthorizationRequired: false, profileSnapshot: { mediaCount: 0 }, mediaSyncState: state,
  };
  const accountFindFirst = vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
    if (where.userId !== (options.ownerId ?? userId) || where.id !== accountId) return null;
    return "accessTokenCiphertext" in (select ?? {}) ? account : { ...account, mediaSyncState: state };
  });
  const accountUpdateMany = vi.fn(async () => ({ count: options.claimCount ?? 1 }));
  const postFindMany = vi.fn(async ({ cursor, take }: { cursor?: { id: string }; take: number }) => {
    const sorted = [...posts];
    const start = cursor ? Math.max(0, sorted.findIndex(post => post.id === cursor.id) + 1) : 0;
    return sorted.slice(start, start + take).map(post => ({ ...post, assets: assets.filter(asset => asset.parentPostId === post.id) }));
  });
  const postCount = vi.fn(async () => posts.length);
  const postUpsert = vi.fn(async ({ where, create, update }: { where: { socialAccountId_providerMediaId: { providerMediaId: string } }; create: Omit<TestPost, "id">; update: Partial<TestPost> }) => {
    const existing = posts.find(post => post.providerMediaId === where.socialAccountId_providerMediaId.providerMediaId);
    if (existing) Object.assign(existing, update);
    else posts.push({ id: `post-${posts.length + 1}`, ...create });
    return { id: existing?.id ?? posts.at(-1)?.id };
  });
  const assetDeleteMany = vi.fn(async ({ where }: { where: { parentPostId: string; userId: string } }) => {
    const matching = assets.filter(asset => asset.parentPostId === where.parentPostId && asset.userId === where.userId);
    for (const asset of matching) assets.splice(assets.indexOf(asset), 1);
    return { count: matching.length };
  });
  const assetCreateMany = vi.fn(async ({ data }: { data: Omit<TestAsset, "id">[] }) => { assets.push(...data.map(asset => ({ id: `asset-${assets.length + 1}`, ...asset }))); return { count: data.length }; });
  const stateUpsert = vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { if (!state.socialAccountId) Object.assign(state, create); Object.assign(state, update); return state; });
  const stateFindFirst = vi.fn(async () => state);
  const stateUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state, data); return state; });
  const runCreate = vi.fn(async () => run);
  const runUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...run, ...data }));
  const tx = {
    instagramMediaPost: { upsert: postUpsert, count: postCount, findMany: postFindMany },
    instagramMediaAsset: { deleteMany: assetDeleteMany, createMany: assetCreateMany },
    instagramMediaSyncState: { upsert: stateUpsert, findFirst: stateFindFirst, update: stateUpdate },
    socialAccount: { updateMany: accountUpdateMany }, socialSyncRun: { create: runCreate, update: runUpdate },
  };
  const db = {
    socialAccount: { findFirst: accountFindFirst, updateMany: accountUpdateMany },
    instagramMediaPost: { findMany: postFindMany, count: postCount },
    instagramMediaSyncState: { upsert: stateUpsert, findFirst: stateFindFirst },
    socialSyncRun: { create: runCreate, update: runUpdate },
    $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { db, posts, assets, state, accountFindFirst, postUpsert, stateUpdate, accountUpdateMany, postFindMany, tx };
}

function configure() {
  vi.stubEnv("WEB_PUBLIC_URL", "http://localhost:3000");
  vi.stubEnv("META_APP_ID", "test-app");
  vi.stubEnv("META_APP_SECRET", "test-secret");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "test-config");
  vi.stubEnv("META_REDIRECT_URI", "http://localhost:3000/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", key);
}

const media = [
  { id: "img-1", media_type: "IMAGE", caption: "Uma imagem real", timestamp: "2026-10-12T10:00:00+0000", permalink: "https://www.instagram.com/p/abc/", media_url: "https://scontent.cdninstagram.com/image.jpg", media_product_type: "FEED" },
  { id: "vid-1", media_type: "VIDEO", thumbnail_url: "https://scontent.cdninstagram.com/video.jpg", media_url: "https://scontent.cdninstagram.com/video.mp4" },
  { id: "album-1", media_type: "CAROUSEL_ALBUM", children: { data: [
    { id: "child-1", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/child.jpg" },
    { id: "child-2", media_type: "VIDEO", thumbnail_url: "https://scontent.cdninstagram.com/child-video.jpg" },
  ] } },
];

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Instagram media collection", () => {
  it("stores IMAGE, VIDEO and CAROUSEL_ALBUM with child order and trusted Meta media URLs", async () => {
    configure();
    const state = database();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Response(JSON.stringify({ data: media, paging: { cursors: { after: "cursor-opaque" } } }), { status: 200 }); });
    vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result).toMatchObject({ outcome: "succeeded", pageRecordsRead: 3, hasMore: false, storedCount: 3 });
    expect(state.posts.map(post => post.mediaType)).toEqual(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
    expect(state.assets.map(asset => [asset.providerMediaId, asset.position])).toEqual([["child-1", 0], ["child-2", 1]]);
    expect(state.posts[0]?.mediaUrl).toBe("https://scontent.cdninstagram.com/image.jpg");
    expect(state.posts[0]).toMatchObject({ caption: "Uma imagem real", mediaProductType: "FEED", permalink: "https://www.instagram.com/p/abc/", returnedFields: expect.arrayContaining(["timestamp", "media_product_type"]) });
    expect(state.posts[1]?.thumbnailUrl).toBe("https://scontent.cdninstagram.com/video.jpg");
    const request = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(request.pathname).toBe("/v26.0/17841400000000001/media");
    expect(request.searchParams.get("limit")).toBe("25");
    expect(request.searchParams.get("access_token")).toBeNull();
    expect(new Headers((fetch.mock.calls[0]?.[1] as RequestInit).headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it("records an actual successful empty /media response independently from profile media_count", async () => {
    configure();
    const state = database();
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Response(JSON.stringify({ data: [] }), { status: 200 }); });
    vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result).toMatchObject({ outcome: "succeeded", pageRecordsRead: 0, storedCount: 0, profileMediaCount: 0, sync: { status: "succeeded", pagesRead: 1, completedAt: expect.any(Date) } });
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toMatch(/\/media$/);
  });

  it("keeps pagination partial and sends only the stored opaque cursor on load more", async () => {
    configure();
    const state = database({ hasMore: true, nextCursor: "opaque-meta-cursor" });
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { void input; void init; return new Response(JSON.stringify({ data: [{ id: "img-next", media_type: "IMAGE" }] }), { status: 200 }); });
    vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "load_more");
    expect(result).toMatchObject({ outcome: "succeeded", pageRecordsRead: 1, sync: { status: "succeeded", hasMore: false, pagesRead: 1 } });
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("after")).toBe("opaque-meta-cursor");
  });

  it("clears an invalid Graph cursor without deleting saved publications", async () => {
    configure();
    const prior = { id: "prior", userId, socialAccountId: accountId, providerMediaId: "saved-post", mediaType: "IMAGE" };
    const state = database({ priorPosts: [prior], hasMore: true, nextCursor: "invalid-meta-cursor" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 100, message: "Invalid pagination cursor" } }), { status: 400 })));
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "load_more");
    expect(result).toMatchObject({ outcome: "cursor_invalid", sync: { status: "cursor_invalid", hasMore: false, lastErrorCode: "cursor_invalid" } });
    expect(state.state.nextCursor).toBeNull();
    expect(state.posts).toEqual([prior]);
  });

  it("retries an individually rejected optional field and records it unavailable", async () => {
    configure();
    const state = database();
    const requestedUrls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return requestedUrls.length === 1
        ? new Response(JSON.stringify({ error: { code: 100, message: "Tried accessing nonexisting field (media_url) on node type IGMedia" } }), { status: 400 })
        : new Response(JSON.stringify({ data: [{ id: "img-safe", media_type: "IMAGE" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result).toMatchObject({ outcome: "succeeded", sync: { unavailableFields: ["media_url"] } });
    expect(state.posts[0]?.mediaUrl).toBeNull();
    const firstFields = new URL(requestedUrls[0]!).searchParams.get("fields");
    const secondFields = new URL(requestedUrls[1]!).searchParams.get("fields");
    expect(firstFields).toContain("media_url");
    expect(secondFields).not.toContain("media_url");
  });

  it("preserves previous publications on Graph errors and marks token reauthorization without exposing provider text", async () => {
    configure();
    const prior = { id: "prior", userId, socialAccountId: accountId, providerMediaId: "prior-post", mediaType: "IMAGE" };
    const state = database({ priorPosts: [prior] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: "private provider message" } }), { status: 400 })));
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result).toMatchObject({ outcome: "reauthorization_required", sync: { lastErrorCode: "token_invalid" } });
    expect(state.posts).toEqual([prior]);
    expect(JSON.stringify(result)).not.toContain("private provider message");
  });

  it("does not fetch or expose media for a different owner", async () => {
    configure();
    const state = database({ ownerId: "another-user" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(new SocialIntegrationsService(state.db).syncMediaPage("not-owner", accountId, "refresh")).rejects.toMatchObject({ response: { code: "social_account_not_found" } });
    expect(fetch).not.toHaveBeenCalled();
    await expect(new SocialIntegrationsService(state.db).listMedia("not-owner", accountId)).rejects.toMatchObject({ response: { code: "social_account_not_found" } });
  });

  it("serializes concurrent refreshes and rate-limits a second claim", async () => {
    configure();
    const state = database({ claimCount: 0 });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result.outcome).toBe("throttled");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("upserts repeated provider IDs and rejects untrusted or credential-bearing media URLs", async () => {
    configure();
    const state = database();
    const response = { data: [{ id: "same-id", media_type: "IMAGE", media_url: "https://example.com/not-meta.jpg" }, { id: "video-id", media_type: "VIDEO", media_url: "https://scontent.cdninstagram.com/video.mp4?access_token=secret" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    const service = new SocialIntegrationsService(state.db);
    await service.syncMediaPage(userId, accountId, "refresh");
    await service.syncMediaPage(userId, accountId, "refresh");
    expect(state.posts).toHaveLength(2);
    expect(state.posts.every(post => post.mediaUrl === null)).toBe(true);
    expect(state.postUpsert).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(state.posts)).not.toContain("access_token");
  });

  it("does not store public pagination as complete while Meta says another page exists", async () => {
    configure();
    const state = database();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "one", media_type: "IMAGE" }], paging: { next: "https://graph.facebook.com/sensitive-url", cursors: { after: "next-cursor" } } }), { status: 200 })));
    const result = await new SocialIntegrationsService(state.db).syncMediaPage(userId, accountId, "refresh");
    expect(result).toMatchObject({ outcome: "succeeded", hasMore: true, sync: { status: "partial", hasMore: true, completedAt: null } });
    expect(JSON.stringify(result)).not.toContain("sensitive-url");
  });
});
