import { BadRequestException, ConflictException, Inject, Injectable, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { decryptMetaToken, encryptMetaToken } from "./token-crypto";

export const META_PROVIDER = "instagram_facebook_login";
export const META_READ_SCOPES = ["pages_show_list", "instagram_basic", "pages_read_engagement"] as const;
const META_CALLBACK_PATH = "/api/integrations/meta/callback";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const PAGE_DISCOVERY_TTL_MS = 10 * 60 * 1000;
const PAGE_DISCOVERY_MAX_ATTEMPTS = 5;
const PROFILE_SYNC_COOLDOWN_MS = 30_000;
const PROFILE_SYNC_LEASE_MS = 30_000;
const MEDIA_REFRESH_COOLDOWN_MS = 30_000;
const MEDIA_PAGE_COOLDOWN_MS = 1_500;
const MEDIA_SYNC_LEASE_MS = 45_000;
const MEDIA_PAGE_LIMIT = 25;
const MEDIA_FIELDS = ["id", "caption", "timestamp", "permalink", "media_type", "media_url", "thumbnail_url", "media_product_type"] as const;
const MEDIA_OPTIONAL_FIELDS = ["caption", "timestamp", "permalink", "media_url", "thumbnail_url", "media_product_type"] as const;
const CHILD_FIELDS = ["id", "media_type", "media_url", "thumbnail_url"] as const;
const MEDIA_TYPES = new Set(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
const INSTAGRAM_PROFILE_FIELDS = ["username", "name", "biography", "profile_picture_url", "followers_count", "follows_count", "media_count", "website"] as const;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

type MetaPage = { id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } | null };
type GraphError = { error?: { type?: string; code?: number; message?: string } };
type MetaPagesResponse = { data: MetaPage[]; paging?: { next?: string; cursors?: { after?: string } } };
type InstagramMediaEdgeResponse = {
  data?: InstagramMediaObject[];
  paging?: { next?: string; cursors?: { after?: string } };
};
type InstagramMediaObject = {
  id?: unknown; caption?: unknown; timestamp?: unknown; permalink?: unknown; media_type?: unknown;
  media_product_type?: unknown; media_url?: unknown; thumbnail_url?: unknown;
  children?: { data?: InstagramMediaObject[] } | null;
};
type InstagramProfileResponse = {
  id?: string;
  username?: unknown;
  name?: unknown;
  biography?: unknown;
  profile_picture_url?: unknown;
  followers_count?: unknown;
  follows_count?: unknown;
  media_count?: unknown;
  website?: unknown;
};

function safeMetaMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const trustedHost = ["cdninstagram.com", "fbcdn.net", "fbsbx.com"].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    if (url.protocol !== "https:" || !trustedHost || url.username || url.password || [...url.searchParams.keys()].some(key => /(access_?token|token|secret|authorization|oauth|(^|[_-])code($|[_-])|(^|[_-])state($|[_-])|api_?key)/i.test(key))) return null;
    return url.toString();
  } catch { return null; }
}

@Injectable()
export class SocialIntegrationsService implements OnModuleInit, OnModuleDestroy {
  private pageDiscoveryCleanupTimer?: NodeJS.Timeout;

  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  onModuleInit() {
    this.pageDiscoveryCleanupTimer = setInterval(() => {
      void this.clearExpiredPageDiscoveryTokens();
    }, 60_000);
    this.pageDiscoveryCleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.pageDiscoveryCleanupTimer) clearInterval(this.pageDiscoveryCleanupTimer);
  }

  private async clearExpiredPageDiscoveryTokens() {
    await this.db.metaOAuthAttempt.updateMany({
      where: { pageDiscoveryExpiresAt: { lt: new Date() }, pageDiscoveryTokenCiphertext: { not: null } },
      data: { pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: new Date() },
    }).catch(() => undefined);
  }

  private configuration() {
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    const redirectUri = process.env.META_REDIRECT_URI?.trim();
    const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
    const graphVersion = process.env.META_GRAPH_API_VERSION?.trim();
    const loginConfigId = process.env.META_LOGIN_CONFIG_ID?.trim();
    const webUrl = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
    const expectedRedirect = new URL(META_CALLBACK_PATH, webUrl).toString();
    const graphVersionValid = Boolean(graphVersion && /^v\d+\.\d+$/.test(graphVersion));
    const keyValid = (() => {
      try { return Boolean(encryptionKey && Buffer.from(encryptionKey, "base64").length === 32); } catch { return false; }
    })();
    const configured = Boolean(appId && appSecret && loginConfigId && redirectUri === expectedRedirect && graphVersionValid && keyValid);
    return { appId, appSecret, loginConfigId, redirectUri, encryptionKey, graphVersion, configured, expectedRedirect };
  }

  async status(userId: string) {
    const config = this.configuration();
    await this.db.metaOAuthAttempt.updateMany({
      where: { userId, pageDiscoveryExpiresAt: { lt: new Date() }, pageDiscoveryTokenCiphertext: { not: null } },
      data: { pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: new Date() },
    });
    const accounts = await this.db.socialAccount.findMany({
      where: { userId, provider: META_PROVIDER, status: { not: "disconnected" } },
      select: {
        id: true, providerAccountId: true, pageName: true, username: true, grantedScopes: true, tokenExpiresAt: true,
        status: true, connectedAt: true, disconnectedAt: true, profileReauthorizationRequired: true,
        profileSnapshot: { select: {
          username: true, name: true, biography: true, profilePictureUrl: true, followersCount: true,
          followsCount: true, mediaCount: true, website: true, returnedFields: true, source: true, apiVersion: true, fetchedAt: true,
        } },
        syncRuns: { where: { operation: "instagram_profile" }, orderBy: { startedAt: "desc" }, take: 1,
          select: { status: true, startedAt: true, finishedAt: true, errorCode: true } },
      },
      orderBy: { connectedAt: "desc" },
    });
    return {
      configured: config.configured,
      provider: META_PROVIDER,
      requiredScopes: META_READ_SCOPES,
      optionalFutureScopes: ["instagram_manage_insights"],
      accounts,
    };
  }

  async begin(userId: string, sessionId: string) {
    const config = this.configuration();
    if (!config.configured || !config.appId || !config.loginConfigId || !config.redirectUri || !config.graphVersion) {
      throw new ServiceUnavailableException({ code: "meta_not_configured", message: "A conexão com a Meta ainda não foi configurada neste ambiente." });
    }
    const now = new Date();
    await this.db.metaOAuthAttempt.updateMany({
      where: { pageDiscoveryExpiresAt: { lt: now }, pageDiscoveryTokenCiphertext: { not: null } },
      data: { pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: now },
    });
    await this.db.metaOAuthAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
    const state = randomBytes(32).toString("base64url");
    await this.db.metaOAuthAttempt.create({ data: { userId, sessionId, stateHash: sha256(state), expiresAt: new Date(Date.now() + OAUTH_TTL_MS) } });
    const authorization = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
    authorization.searchParams.set("client_id", config.appId);
    authorization.searchParams.set("redirect_uri", config.redirectUri);
    authorization.searchParams.set("response_type", "code");
    // Facebook Login for Business takes permissions from the dashboard configuration.
    // Do not send `scope` here: it can conflict with, or be ignored in favor of, config_id.
    authorization.searchParams.set("config_id", config.loginConfigId);
    authorization.searchParams.set("state", state);
    return { authorizationUrl: authorization.toString() };
  }

  private async graphJson<T>(url: URL, bearerToken?: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000), headers: { accept: "application/json", ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}) } });
    } catch {
      throw new MetaApiError("graph_transport_error");
    }
    const data = await response.json().catch(() => null) as (T & GraphError) | null;
    if (!response.ok || !data || data.error) {
      const graphCode = data?.error?.code;
      const providerMessage = data?.error?.message ?? "";
      if (graphCode === 100 && /cursor|pagination|after/i.test(providerMessage)) throw new MetaApiError("cursor_invalid", graphCode);
      if (graphCode === 100) {
        const match = providerMessage.match(/(?:nonexisting|non-existent|invalid|unknown) field\s*\(?([a-z_]+)\)?/i)
          ?? providerMessage.match(/field\s*\(?([a-z_]+)\)?[^.]*does not exist/i);
        const field = match?.[1]?.toLowerCase();
        if (field && [...MEDIA_OPTIONAL_FIELDS, ...CHILD_FIELDS].some(candidate => candidate.toLowerCase() === field)) {
          throw new MetaApiError("unsupported_field", graphCode, field);
        }
      }
      if (graphCode === 10 || graphCode === 200) throw new MetaIntegrationError("insufficient_permissions");
      if (response.status === 429 || [4, 17, 32, 613].includes(graphCode ?? -1)) throw new MetaApiError("rate_limited", graphCode);
      throw new MetaApiError(graphCode === 190 ? "token_invalid" : `graph_http_${response.status}`, graphCode);
    }
    return data as T;
  }

  private async graphMediaPage<T extends InstagramMediaEdgeResponse>(url: URL, token: string) {
    const fields = [...MEDIA_FIELDS] as string[];
    const childFields = [...CHILD_FIELDS] as string[];
    const unavailableFields: string[] = [];
    let includeChildren = true;
    for (let attempt = 0; attempt <= MEDIA_OPTIONAL_FIELDS.length + CHILD_FIELDS.length; attempt += 1) {
      const requested = includeChildren ? [...fields, `children{${childFields.join(",")}}`] : fields;
      url.searchParams.set("fields", requested.join(","));
      try { return { response: await this.graphJson<T>(url, token), unavailableFields, requestedFields: requested }; }
      catch (error) {
        if (!(error instanceof MetaApiError) || error.code !== "unsupported_field" || !error.unsupportedField) throw error;
        const field = error.unsupportedField;
        const parentIndex = fields.indexOf(field);
        const childIndex = childFields.indexOf(field);
        if (field === "children") {
          if (!includeChildren) throw new MetaIntegrationError("required_media_field_unavailable");
          unavailableFields.push(field);
          includeChildren = false;
          continue;
        }
        if (parentIndex < 0 && childIndex < 0) throw new MetaIntegrationError("required_media_field_unavailable");
        if (field === "id" || field === "media_type") throw new MetaIntegrationError("required_media_field_unavailable");
        unavailableFields.push(field);
        if (parentIndex >= 0) fields.splice(parentIndex, 1);
        if (childIndex >= 0) childFields.splice(childIndex, 1);
      }
    }
    throw new MetaIntegrationError("media_fields_unavailable");
  }

  private async exchangeCode(code: string) {
    const config = this.configuration();
    if (!config.appId || !config.appSecret || !config.redirectUri || !config.graphVersion) throw new MetaIntegrationError("meta_not_configured");
    const exchange = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
    exchange.searchParams.set("client_id", config.appId);
    exchange.searchParams.set("client_secret", config.appSecret);
    exchange.searchParams.set("redirect_uri", config.redirectUri);
    exchange.searchParams.set("code", code);
    const shortToken = await this.graphJson<{ access_token: string }>(exchange);
    if (!shortToken.access_token) throw new MetaIntegrationError("token_exchange_failed");

    // Exchange the login token for a longer-lived user token before resolving Pages.
    const longLived = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
    longLived.searchParams.set("grant_type", "fb_exchange_token");
    longLived.searchParams.set("client_id", config.appId);
    longLived.searchParams.set("client_secret", config.appSecret);
    longLived.searchParams.set("fb_exchange_token", shortToken.access_token);
    const longToken = await this.graphJson<{ access_token: string }>(longLived);
    if (!longToken.access_token) throw new MetaIntegrationError("token_exchange_failed");
    return longToken.access_token;
  }

  private async getPages(token: string) {
    const config = this.configuration();
    if (!config.graphVersion) throw new MetaIntegrationError("meta_not_configured");
    const permissionsUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/me/permissions`);
    permissionsUrl.searchParams.set("access_token", token);
    const permissionResponse = await this.graphJson<{ data?: Array<{ permission: string; status: string }> }>(permissionsUrl);
    if (!Array.isArray(permissionResponse.data)) throw new MetaApiError("graph_invalid_permissions_response");
    const granted = new Set(permissionResponse.data.filter(item => item.status === "granted").map(item => item.permission));
    const missingScopes = META_READ_SCOPES.filter(scope => !granted.has(scope));
    if (missingScopes.length > 0) throw new MetaIntegrationError("required_scope_missing");

    const pages: MetaPage[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const pagesUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/me/accounts`);
      pagesUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
      pagesUrl.searchParams.set("limit", "100");
      pagesUrl.searchParams.set("access_token", token);
      if (cursor) pagesUrl.searchParams.set("after", cursor);
      const result = await this.graphJson<MetaPagesResponse>(pagesUrl);
      if (!Array.isArray(result.data)) throw new MetaApiError("graph_invalid_pages_response");
      pages.push(...result.data);
      if (!result.paging?.next) break;
      cursor = result.paging.cursors?.after;
      if (!cursor) throw new MetaIntegrationError("page_cursor_missing");
      if (pageNumber === 19) throw new MetaIntegrationError("page_list_limit_exceeded");
    }
    const linkedPages = pages.filter(page => page.instagram_business_account?.id);
    const incompletePage = linkedPages.find(page => !page.id || !page.access_token);
    if (incompletePage) throw new MetaIntegrationError(!incompletePage.access_token ? "page_access_token_missing" : "page_data_incomplete", pages.length);
    return {
      pages: [...new Map(linkedPages.map(page => [page.instagram_business_account!.id!, page])).values()],
      pagesRead: pages.length,
      pagesWithoutInstagram: pages.length - linkedPages.length,
      scopes: META_READ_SCOPES.filter(scope => granted.has(scope)),
    };
  }

  private async recordFailedRun(userId: string, errorCode: string, recordsRead = 0) {
    await this.db.socialSyncRun.create({ data: { userId, provider: META_PROVIDER, operation: "oauth_account_discovery", status: "failed", finishedAt: new Date(), errorCode, recordsRead } });
  }

  async complete(userId: string, sessionId: string, state: string | undefined, code: string | undefined, oauthError?: string) {
    if (!state || state.length > 256 || !/^[A-Za-z0-9_-]+$/.test(state)) return "invalid_state" as const;
    const now = new Date();
    const attempt = await this.db.metaOAuthAttempt.findUnique({ where: { stateHash: sha256(state) } });
    if (!attempt || attempt.userId !== userId || attempt.sessionId !== sessionId || attempt.consumedAt || attempt.expiresAt <= now) return "invalid_state" as const;
    const consumed = await this.db.metaOAuthAttempt.updateMany({ where: { id: attempt.id, userId, sessionId, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (consumed.count !== 1) return "invalid_state" as const;
    if (oauthError) {
      await this.recordFailedRun(userId, "authorization_denied");
      return "denied" as const;
    }
    if (!code || code.length > 4096) {
      await this.recordFailedRun(userId, "authorization_code_missing");
      return "failed" as const;
    }
    const config = this.configuration();
    if (!config.configured || !config.encryptionKey) {
      await this.recordFailedRun(userId, "meta_not_configured");
      return "not_configured" as const;
    }
    try {
      const startedAt = new Date();
      const token = await this.exchangeCode(code);
      const { pages, scopes, pagesRead } = await this.getPages(token);
      if (pagesRead === 0) {
        await this.db.metaOAuthAttempt.update({
          where: { id: attempt.id },
          data: {
            pageDiscoveryTokenCiphertext: encryptMetaToken(token, config.encryptionKey!),
            pageDiscoveryScopes: scopes,
            pageDiscoveryExpiresAt: new Date(Date.now() + PAGE_DISCOVERY_TTL_MS),
            pageDiscoveryConsumedAt: null,
            pageDiscoveryAttempts: 0,
          },
        });
        await this.recordFailedRun(userId, "no_accessible_pages");
        return "page_id_required" as const;
      }
      if (pages.length === 0) {
        await this.recordFailedRun(userId, "pages_without_instagram_account", pagesRead);
        return "pages_without_instagram" as const;
      }
      // The Page access-token response does not carry a Page-token expiry. Keep it unknown;
      // the user-token expiry is not a valid substitute for the Page-token expiry.
      const tokenExpiresAt = null;
      const saved = await this.db.$transaction(async transaction => {
        const accounts = [];
        for (const page of pages) {
          const account = await transaction.socialAccount.upsert({
            where: { userId_provider_providerAccountId: { userId, provider: META_PROVIDER, providerAccountId: page.instagram_business_account!.id! } },
            create: {
              userId, provider: META_PROVIDER, providerAccountId: page.instagram_business_account!.id!, pageId: page.id!,
              pageName: page.name ?? null, username: page.instagram_business_account!.username ?? null, grantedScopes: scopes,
              accessTokenCiphertext: encryptMetaToken(page.access_token!, config.encryptionKey!), tokenExpiresAt,
              status: "connected", disconnectedAt: null,
            },
            update: {
              pageId: page.id!, pageName: page.name ?? null, username: page.instagram_business_account!.username ?? null,
              grantedScopes: scopes, accessTokenCiphertext: encryptMetaToken(page.access_token!, config.encryptionKey!),
              tokenExpiresAt, status: "connected", disconnectedAt: null, profileSyncLeaseUntil: null,
              profileSyncLastErrorCode: null, profileReauthorizationRequired: false,
            },
            select: { id: true },
          });
          accounts.push(account);
          await transaction.socialSyncRun.create({ data: {
            userId, socialAccountId: account.id, provider: META_PROVIDER, operation: "oauth_account_discovery",
            status: "succeeded", startedAt, finishedAt: new Date(), recordsRead: 1,
          } });
        }
        return accounts;
      });
      if (saved.length === 0) {
        await this.recordFailedRun(userId, "internal_empty_persistence", pagesRead);
        return "failed" as const;
      }
      return "connected" as const;
    } catch (error) {
      const errorCode = error instanceof MetaIntegrationError || error instanceof MetaApiError ? error.code : "internal_error";
      const recordsRead = error instanceof MetaIntegrationError ? error.recordsRead : 0;
      await this.recordFailedRun(userId, errorCode, recordsRead);
      if (errorCode === "meta_not_configured") return "not_configured" as const;
      if (errorCode === "required_scope_missing" || errorCode === "insufficient_permissions") return "missing_permissions" as const;
      if (error instanceof MetaApiError || errorCode === "page_access_token_missing" || errorCode === "page_data_incomplete") return "graph_api_error" as const;
      return "failed" as const;
    }
  }

  async connectPageById(userId: string, sessionId: string, pageId: string) {
    if (!/^\d{1,32}$/.test(pageId)) throw new MetaIntegrationError("invalid_page_id");
    const config = this.configuration();
    if (!config.encryptionKey || !config.graphVersion) return { outcome: "meta_not_configured" as const };
    const now = new Date();
    await this.db.metaOAuthAttempt.updateMany({
      where: { userId, sessionId, pageDiscoveryExpiresAt: { lt: now }, pageDiscoveryTokenCiphertext: { not: null } },
      data: { pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: now },
    });
    const attempt = await this.db.metaOAuthAttempt.findFirst({
      where: {
        userId, sessionId, consumedAt: { not: null }, pageDiscoveryTokenCiphertext: { not: null },
        pageDiscoveryExpiresAt: { gt: now }, pageDiscoveryConsumedAt: null,
        pageDiscoveryAttempts: { lt: PAGE_DISCOVERY_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!attempt?.pageDiscoveryTokenCiphertext) return { outcome: "page_discovery_expired" as const };
    const started = await this.db.metaOAuthAttempt.updateMany({
      where: { id: attempt.id, userId, sessionId, pageDiscoveryConsumedAt: null, pageDiscoveryExpiresAt: { gt: now }, pageDiscoveryAttempts: { lt: PAGE_DISCOVERY_MAX_ATTEMPTS } },
      data: { pageDiscoveryAttempts: { increment: 1 } },
    });
    if (started.count !== 1) return { outcome: "page_discovery_expired" as const };
    const granted = new Set(attempt.pageDiscoveryScopes);
    if (META_READ_SCOPES.some(scope => !granted.has(scope))) return { outcome: "missing_permissions" as const };

    const userToken = decryptMetaToken(attempt.pageDiscoveryTokenCiphertext, config.encryptionKey);
    const pageUrl = new URL(`https://graph.facebook.com/${config.graphVersion}/${pageId}`);
    pageUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    pageUrl.searchParams.set("access_token", userToken);
    let page: MetaPage;
    try {
      page = await this.graphJson<MetaPage>(pageUrl);
    } catch (error) {
      const code = error instanceof MetaApiError ? error.code : error instanceof MetaIntegrationError ? error.code : "internal_error";
      await this.recordFailedRun(userId, code, 0);
      if (code === "insufficient_permissions") return { outcome: "missing_permissions" as const };
      if (error instanceof MetaApiError && (error.graphCode === 100 || error.graphCode === 803)) return { outcome: "page_not_authorized" as const };
      if (error instanceof MetaApiError) return { outcome: "graph_api_error" as const };
      throw error;
    }
    if (page.id !== pageId || !page.access_token) {
      await this.recordFailedRun(userId, "page_access_not_proven");
      return { outcome: "page_not_authorized" as const };
    }
    const instagram = page.instagram_business_account;
    if (!instagram?.id) {
      await this.recordFailedRun(userId, "page_without_instagram_account", 1);
      return { outcome: "page_without_instagram" as const };
    }

    const saved = await this.db.$transaction(async transaction => {
      const account = await transaction.socialAccount.upsert({
        where: { userId_provider_providerAccountId: { userId, provider: META_PROVIDER, providerAccountId: instagram.id! } },
        create: {
          userId, provider: META_PROVIDER, providerAccountId: instagram.id!, pageId: page.id!, pageName: page.name ?? null,
          username: instagram.username ?? null, grantedScopes: [...granted], accessTokenCiphertext: encryptMetaToken(page.access_token!, config.encryptionKey!),
          tokenExpiresAt: null, status: "connected", disconnectedAt: null,
        },
        update: {
          pageId: page.id!, pageName: page.name ?? null, username: instagram.username ?? null, grantedScopes: [...granted],
          accessTokenCiphertext: encryptMetaToken(page.access_token!, config.encryptionKey!), tokenExpiresAt: null,
          status: "connected", disconnectedAt: null, profileSyncLeaseUntil: null,
          profileSyncLastErrorCode: null, profileReauthorizationRequired: false,
        },
        select: { id: true },
      });
      await transaction.socialSyncRun.create({ data: {
        userId, socialAccountId: account.id, provider: META_PROVIDER, operation: "oauth_page_id_discovery",
        status: "succeeded", finishedAt: new Date(), recordsRead: 1,
      } });
      await transaction.metaOAuthAttempt.update({
        where: { id: attempt.id },
        data: { pageDiscoveryTokenCiphertext: null, pageDiscoveryScopes: [], pageDiscoveryConsumedAt: new Date() },
      });
      return account;
    });
    return { outcome: "connected" as const, accountId: saved.id };
  }

  async disconnect(userId: string, accountId: string) {
    await this.db.$transaction(async transaction => {
      const result = await transaction.socialAccount.updateMany({
        where: { id: accountId, userId, provider: META_PROVIDER, status: { not: "disconnected" } },
        data: { accessTokenCiphertext: null, grantedScopes: [], status: "disconnected", disconnectedAt: new Date(), profileSyncLeaseUntil: null },
      });
      if (result.count !== 1) throw new ConflictException({ code: "social_account_not_found", message: "Esta conta conectada não foi encontrada." });
      await transaction.instagramProfileSnapshot.deleteMany({ where: { socialAccountId: accountId, userId } });
      await transaction.instagramMediaAsset.deleteMany({ where: { socialAccountId: accountId, userId } });
      await transaction.instagramMediaPost.deleteMany({ where: { socialAccountId: accountId, userId } });
      await transaction.instagramMediaSyncState.deleteMany({ where: { socialAccountId: accountId, userId } });
      await transaction.socialSyncRun.create({ data: { userId, socialAccountId: accountId, provider: META_PROVIDER, operation: "disconnect", status: "succeeded", finishedAt: new Date() } });
    });
    return { message: "A conexão foi removida e a credencial armazenada foi apagada." };
  }

  async syncProfile(userId: string, accountId: string) {
    const config = this.configuration();
    if (!config.encryptionKey || !config.graphVersion) return { outcome: "meta_not_configured" as const };
    const now = new Date();
    const allowedSince = new Date(now.getTime() - PROFILE_SYNC_COOLDOWN_MS);
    const leaseUntil = new Date(now.getTime() + PROFILE_SYNC_LEASE_MS);
    const claim = await this.db.socialAccount.updateMany({
      where: {
        id: accountId, userId, provider: META_PROVIDER, status: "connected",
        OR: [{ profileSyncLeaseUntil: null }, { profileSyncLeaseUntil: { lt: now } }],
        AND: [{ OR: [{ profileSyncLastAttemptAt: null }, { profileSyncLastAttemptAt: { lt: allowedSince } }] }],
      },
      data: { profileSyncLeaseUntil: leaseUntil, profileSyncLastAttemptAt: now },
    });
    if (claim.count !== 1) return { outcome: "throttled" as const, ...(await this.readProfileStatus(userId, accountId)) };

    const run = await this.db.socialSyncRun.create({ data: {
      userId, socialAccountId: accountId, provider: META_PROVIDER, operation: "instagram_profile", status: "running", startedAt: now,
    }, select: { id: true } });
    try {
      const account = await this.db.socialAccount.findFirst({
        where: { id: accountId, userId, provider: META_PROVIDER, status: "connected" },
        select: { id: true, providerAccountId: true, accessTokenCiphertext: true },
      });
      if (!account || !account.accessTokenCiphertext) throw new MetaIntegrationError("connected_account_unavailable");
      if (!/^\d{1,32}$/.test(account.providerAccountId)) throw new MetaIntegrationError("invalid_instagram_account_id");
      const token = decryptMetaToken(account.accessTokenCiphertext, config.encryptionKey);
      const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${account.providerAccountId}`);
      url.searchParams.set("fields", `id,${INSTAGRAM_PROFILE_FIELDS.join(",")}`);
      const response = await this.graphJson<InstagramProfileResponse>(url, token);
      if (response.id !== account.providerAccountId) throw new MetaIntegrationError("profile_account_mismatch");
      const snapshotData = this.parseProfileSnapshot(response);
      const fetchedAt = new Date();
      await this.db.$transaction(async transaction => {
        await transaction.instagramProfileSnapshot.upsert({
          where: { socialAccountId: accountId },
          create: { userId, socialAccountId: accountId, ...snapshotData, source: "instagram_graph_api", apiVersion: config.graphVersion!, fetchedAt },
          update: { ...snapshotData, source: "instagram_graph_api", apiVersion: config.graphVersion!, fetchedAt },
        });
        await transaction.socialAccount.updateMany({ where: { id: accountId, userId }, data: { profileSyncLeaseUntil: null, profileSyncLastErrorCode: null, profileReauthorizationRequired: false } });
        await transaction.socialSyncRun.update({ where: { id: run.id }, data: { status: "succeeded", finishedAt: fetchedAt, recordsRead: 1, errorCode: null } });
      });
      return { outcome: "succeeded" as const, ...(await this.readProfileStatus(userId, accountId)) };
    } catch (error) {
      const errorCode = error instanceof MetaIntegrationError || error instanceof MetaApiError ? error.code : "internal_error";
      const failedAt = new Date();
      await this.db.$transaction(async transaction => {
        await transaction.socialAccount.updateMany({ where: { id: accountId, userId }, data: {
          profileSyncLeaseUntil: null, profileSyncLastErrorCode: errorCode,
          ...(errorCode === "token_invalid" ? { profileReauthorizationRequired: true } : {}),
        } });
        await transaction.socialSyncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: failedAt, errorCode } });
      });
      return { outcome: errorCode === "rate_limited" ? "rate_limited" as const : "failed" as const, errorCode, ...(await this.readProfileStatus(userId, accountId)) };
    }
  }

  async listMedia(userId: string, accountId: string, after?: string) {
    if (after && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(after)) {
      throw new BadRequestException({ code: "media_cursor_invalid", message: "A lista mudou. Atualize as publicações para continuar." });
    }
    const account = await this.db.socialAccount.findFirst({
      where: { id: accountId, userId, provider: META_PROVIDER, status: "connected" },
      select: {
        id: true, mediaReauthorizationRequired: true,
        profileSnapshot: { select: { mediaCount: true } },
        mediaSyncState: { select: {
          status: true, hasMore: true, requestedFields: true, unavailableFields: true, storedCount: true,
          recordsRead: true, pagesRead: true, warningCode: true, lastErrorCode: true, lastAttemptAt: true,
          lastSuccessAt: true, completedAt: true, source: true, apiVersion: true,
        } },
      },
    });
    if (!account) throw new ConflictException({ code: "social_account_not_found", message: "Esta conta conectada não foi encontrada." });
    const cursor = after ? { id: after } : undefined;
    let posts;
    try {
      posts = await this.db.instagramMediaPost.findMany({
        where: { userId, socialAccountId: accountId },
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
        ...(cursor ? { cursor, skip: 1 } : {}), take: 13,
        include: { assets: { orderBy: { position: "asc" }, select: {
          id: true, providerMediaId: true, position: true, mediaType: true, mediaUrl: true, thumbnailUrl: true, returnedFields: true,
        } } },
      });
    } catch (error) {
      if (after) throw new BadRequestException({ code: "media_cursor_invalid", message: "A lista mudou. Atualize as publicações para continuar." });
      throw error;
    }
    const hasMoreStored = posts.length > 12;
    const page = posts.slice(0, 12);
    const storedCount = await this.db.instagramMediaPost.count({ where: { userId, socialAccountId: accountId } });
    return {
      accountId,
      posts: page,
      nextCursor: hasMoreStored ? page.at(-1)?.id ?? null : null,
      hasMoreStored,
      profileMediaCount: account.profileSnapshot?.mediaCount ?? null,
      storedCount,
      loadedCount: page.length,
      mediaReauthorizationRequired: account.mediaReauthorizationRequired,
      sync: account.mediaSyncState ? { ...account.mediaSyncState, storedCount } : {
        status: "never_synced", hasMore: false, requestedFields: [], unavailableFields: [], storedCount,
        recordsRead: 0, pagesRead: 0, warningCode: null, lastErrorCode: null, lastAttemptAt: null,
        lastSuccessAt: null, completedAt: null, source: "instagram_graph_api", apiVersion: process.env.META_GRAPH_API_VERSION ?? "v26.0",
      },
    };
  }

  async syncMediaPage(userId: string, accountId: string, mode: "refresh" | "load_more") {
    const config = this.configuration();
    if (!config.encryptionKey || !config.graphVersion) return { outcome: "meta_not_configured" as const };
    const owner = await this.db.socialAccount.findFirst({
      where: { id: accountId, userId, provider: META_PROVIDER, status: "connected" },
      select: { id: true, providerAccountId: true, accessTokenCiphertext: true, mediaReauthorizationRequired: true },
    });
    if (!owner) throw new ConflictException({ code: "social_account_not_found", message: "Esta conta conectada não foi encontrada." });
    if (owner.mediaReauthorizationRequired) return { outcome: "reauthorization_required" as const, ...(await this.listMedia(userId, accountId)) };

    const now = new Date();
    const cooldown = mode === "refresh" ? MEDIA_REFRESH_COOLDOWN_MS : MEDIA_PAGE_COOLDOWN_MS;
    const allowedSince = new Date(now.getTime() - cooldown);
    const claim = await this.db.socialAccount.updateMany({
      where: {
        id: accountId, userId, provider: META_PROVIDER, status: "connected",
        OR: [{ mediaSyncLeaseUntil: null }, { mediaSyncLeaseUntil: { lt: now } }],
        AND: [{ OR: [{ mediaSyncLastAttemptAt: null }, { mediaSyncLastAttemptAt: { lt: allowedSince } }] }],
      },
      data: { mediaSyncLeaseUntil: new Date(now.getTime() + MEDIA_SYNC_LEASE_MS), mediaSyncLastAttemptAt: now },
    });
    if (claim.count !== 1) return { outcome: "throttled" as const, ...(await this.listMedia(userId, accountId)) };

    await this.db.instagramMediaSyncState.upsert({
      where: { socialAccountId: accountId },
      create: { userId, socialAccountId: accountId, status: "never_synced", apiVersion: config.graphVersion },
      update: {},
    });
    const previous = await this.db.instagramMediaSyncState.findFirst({ where: { socialAccountId: accountId, userId } });
    if (!previous) {
      await this.db.socialAccount.updateMany({ where: { id: accountId, userId }, data: { mediaSyncLeaseUntil: null } });
      throw new ConflictException({ code: "social_account_not_found", message: "Esta conta conectada não foi encontrada." });
    }
    if (mode === "load_more" && (!previous.hasMore || !previous.nextCursor)) {
      await this.db.socialAccount.updateMany({ where: { id: accountId, userId }, data: { mediaSyncLeaseUntil: null } });
      return { outcome: "no_more_pages" as const, ...(await this.listMedia(userId, accountId)) };
    }

    const run = await this.db.socialSyncRun.create({ data: {
      userId, socialAccountId: accountId, provider: META_PROVIDER, operation: "instagram_media", status: "running", startedAt: now,
    }, select: { id: true } });
    const cursor = mode === "refresh" ? null : previous.nextCursor;
    const nextPageCount = mode === "refresh" ? 1 : previous.pagesRead + 1;
    const nextRecordsRead = mode === "refresh" ? 0 : previous.recordsRead;

    try {
      if (!owner.accessTokenCiphertext || !/^\d{1,32}$/.test(owner.providerAccountId)) throw new MetaIntegrationError("connected_account_unavailable");
      const token = decryptMetaToken(owner.accessTokenCiphertext, config.encryptionKey);
      const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${owner.providerAccountId}/media`);
      url.searchParams.set("limit", String(MEDIA_PAGE_LIMIT));
      if (cursor) url.searchParams.set("after", cursor);
      const { response, unavailableFields, requestedFields } = await this.graphMediaPage<InstagramMediaEdgeResponse>(url, token);
      if (!Array.isArray(response.data)) throw new MetaIntegrationError("invalid_media_page");
      const edgeHasMore = Boolean(response.paging?.next);
      const nextCursor = response.paging?.cursors?.after ?? null;
      if (edgeHasMore && !nextCursor) throw new MetaIntegrationError("pagination_cursor_missing");
      const fetchedAt = new Date();
      let invalidRecords = 0;
      const parsed = response.data.flatMap(media => {
        const item = this.parseInstagramMedia(media, fetchedAt);
        if (!item) { invalidRecords += 1; return []; }
        const children = Array.isArray(media.children?.data)
          ? media.children.data.flatMap((child, childIndex) => {
            const asset = this.parseInstagramMediaAsset(child, childIndex, fetchedAt);
            if (!asset) invalidRecords += 1;
            return asset ? [asset] : [];
          })
          : null;
        return [{ ...item, children }];
      });
      const accumulatedUnavailable = [...new Set([...(mode === "load_more" ? previous.unavailableFields : []), ...unavailableFields])];
      await this.db.$transaction(async transaction => {
        for (const item of parsed) {
          const { children, ...post } = item;
          const saved = await transaction.instagramMediaPost.upsert({
            where: { socialAccountId_providerMediaId: { socialAccountId: accountId, providerMediaId: post.providerMediaId } },
            create: { userId, socialAccountId: accountId, ...post },
            update: { ...post, userId, socialAccountId: accountId },
            select: { id: true },
          });
          if (children !== null) {
            await transaction.instagramMediaAsset.deleteMany({ where: { userId, socialAccountId: accountId, parentPostId: saved.id } });
            if (children.length) await transaction.instagramMediaAsset.createMany({
              data: children.map(child => ({ userId, socialAccountId: accountId, parentPostId: saved.id, ...child })), skipDuplicates: true,
            });
          }
        }
        const storedCount = await transaction.instagramMediaPost.count({ where: { userId, socialAccountId: accountId } });
        await transaction.instagramMediaSyncState.update({
          where: { socialAccountId: accountId },
          data: {
            status: invalidRecords ? "partial_with_warnings" : edgeHasMore ? "partial" : "succeeded",
            nextCursor: edgeHasMore ? nextCursor : null, hasMore: edgeHasMore,
            requestedFields, unavailableFields: accumulatedUnavailable,
            storedCount, recordsRead: nextRecordsRead + response.data!.length, pagesRead: nextPageCount,
            warningCode: invalidRecords ? "invalid_media_records" : null, lastErrorCode: null,
            lastAttemptAt: fetchedAt, lastSuccessAt: fetchedAt, completedAt: edgeHasMore ? null : fetchedAt,
            source: "instagram_graph_api", apiVersion: config.graphVersion!,
          },
        });
        await transaction.socialAccount.updateMany({ where: { id: accountId, userId }, data: { mediaSyncLeaseUntil: null, mediaReauthorizationRequired: false } });
        await transaction.socialSyncRun.update({ where: { id: run.id }, data: {
          status: invalidRecords ? "partial" : edgeHasMore ? "partial" : "succeeded", finishedAt: fetchedAt,
          recordsRead: response.data!.length, errorCode: invalidRecords ? "invalid_media_records" : null,
        } });
      });
      const result = await this.listMedia(userId, accountId);
      return { outcome: "succeeded" as const, pageRecordsRead: response.data.length, hasMore: edgeHasMore, ...result };
    } catch (error) {
      const errorCode = error instanceof MetaIntegrationError || error instanceof MetaApiError ? error.code : "internal_error";
      const failedAt = new Date();
      await this.db.$transaction(async transaction => {
        await transaction.socialAccount.updateMany({ where: { id: accountId, userId }, data: {
          mediaSyncLeaseUntil: null,
          ...(errorCode === "token_invalid" ? { mediaReauthorizationRequired: true } : {}),
        } });
        await transaction.instagramMediaSyncState.update({
          where: { socialAccountId: accountId }, data: {
            status: errorCode === "cursor_invalid" ? "cursor_invalid" : errorCode === "token_invalid" ? "reauthorization_required" : "failed",
            ...(errorCode === "cursor_invalid" ? { nextCursor: null, hasMore: false, completedAt: null } : {}),
            lastAttemptAt: failedAt, lastErrorCode: errorCode,
          },
        });
        await transaction.socialSyncRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: failedAt, errorCode } });
      });
      const outcome = errorCode === "rate_limited" ? "rate_limited" : errorCode === "token_invalid" ? "reauthorization_required" : errorCode === "cursor_invalid" ? "cursor_invalid" : "failed";
      return { outcome, errorCode, ...(await this.listMedia(userId, accountId)) };
    }
  }

  private parseInstagramMedia(media: InstagramMediaObject, fetchedAt: Date) {
    if (typeof media.id !== "string" || !media.id || typeof media.media_type !== "string" || !MEDIA_TYPES.has(media.media_type)) return null;
    const nullableString = (value: unknown) => typeof value === "string" ? value : null;
    const publishedAt = typeof media.timestamp === "string" ? new Date(media.timestamp) : null;
    return {
      providerMediaId: media.id,
      caption: nullableString(media.caption),
      publishedAt: publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt : null,
      permalink: nullableString(media.permalink),
      mediaType: media.media_type,
      mediaProductType: nullableString(media.media_product_type),
      mediaUrl: safeMetaMediaUrl(media.media_url),
      thumbnailUrl: safeMetaMediaUrl(media.thumbnail_url),
      returnedFields: ["id", "caption", "timestamp", "permalink", "media_type", "media_url", "thumbnail_url", "media_product_type"].filter(field => Object.hasOwn(media, field)),
      source: "instagram_graph_api",
      apiVersion: this.configuration().graphVersion ?? "v26.0",
      fetchedAt,
    };
  }

  private parseInstagramMediaAsset(media: InstagramMediaObject, position: number, fetchedAt: Date) {
    if (typeof media.id !== "string" || !media.id || typeof media.media_type !== "string" || !MEDIA_TYPES.has(media.media_type)) return null;
    return {
      providerMediaId: media.id, position, mediaType: media.media_type,
      mediaUrl: safeMetaMediaUrl(media.media_url), thumbnailUrl: safeMetaMediaUrl(media.thumbnail_url),
      returnedFields: ["id", "media_type", "media_url", "thumbnail_url"].filter(field => Object.hasOwn(media, field)),
      source: "instagram_graph_api", apiVersion: this.configuration().graphVersion ?? "v26.0", fetchedAt,
    };
  }

  private parseProfileSnapshot(response: InstagramProfileResponse) {
    const nullableString = (field: typeof INSTAGRAM_PROFILE_FIELDS[number]) => {
      const value = response[field];
      if (value === undefined || value === null) return null;
      if (typeof value !== "string") throw new MetaIntegrationError("invalid_profile_payload");
      return value;
    };
    const nullableCount = (field: "followers_count" | "follows_count" | "media_count") => {
      const value = response[field];
      if (value === undefined || value === null) return null;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) throw new MetaIntegrationError("invalid_profile_payload");
      return value;
    };
    const returnedFields = INSTAGRAM_PROFILE_FIELDS.filter(field => Object.hasOwn(response, field));
    return {
      username: nullableString("username"), name: nullableString("name"), biography: nullableString("biography"),
      profilePictureUrl: nullableString("profile_picture_url"), followersCount: nullableCount("followers_count"),
      followsCount: nullableCount("follows_count"), mediaCount: nullableCount("media_count"), website: nullableString("website"),
      returnedFields: [...returnedFields],
    };
  }

  private async readProfileStatus(userId: string, accountId: string) {
    const account = await this.db.socialAccount.findFirst({
      where: { id: accountId, userId, provider: META_PROVIDER },
      select: {
        profileSnapshot: { select: {
          username: true, name: true, biography: true, profilePictureUrl: true, followersCount: true,
          followsCount: true, mediaCount: true, website: true, returnedFields: true, source: true, apiVersion: true, fetchedAt: true,
        } }, profileReauthorizationRequired: true,
        syncRuns: { where: { operation: "instagram_profile" }, orderBy: { startedAt: "desc" }, take: 1,
          select: { status: true, startedAt: true, finishedAt: true, errorCode: true } },
      },
    });
    if (!account) return { profile: null, lastSync: null, reauthorizationRequired: false };
    return { profile: account.profileSnapshot, lastSync: account.syncRuns[0] ?? null, reauthorizationRequired: account.profileReauthorizationRequired };
  }
}

export class MetaIntegrationError extends Error {
  constructor(readonly code: string, readonly recordsRead = 0) { super(code); this.name = "MetaIntegrationError"; }
}

export class MetaApiError extends Error {
  constructor(readonly code: string, readonly graphCode?: number, readonly unsupportedField?: string) { super(code); this.name = "MetaApiError"; }
}
