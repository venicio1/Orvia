import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InstagramPublications } from "./instagram-publications";

vi.mock("@/lib/csrf", () => ({ csrfToken: () => "csrf-test-only" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const account = { id: "11111111-1111-4111-8111-111111111111", username: "unicstreetbr", pageName: "Orvia Testes", status: "connected", mediaReauthorizationRequired: false };
const neverSynced = { accountId: account.id, posts: [], nextCursor: null, hasMoreStored: false, profileMediaCount: 0, storedCount: 0, loadedCount: 0, mediaReauthorizationRequired: false, sync: { status: "never_synced", hasMore: false, requestedFields: [], unavailableFields: [], storedCount: 0, recordsRead: 0, pagesRead: 0, warningCode: null, lastErrorCode: null, lastAttemptAt: null, lastSuccessAt: null, completedAt: null, source: "instagram_graph_api", apiVersion: "v26.0" } };

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }

describe("InstagramPublications", () => {
  it("performs one initial real synchronization and distinguishes profile total from /media empty result", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    let mediaReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? "GET"; requests.push({ url, method });
      if (url === "/api/integrations/meta/status") return json({ configured: true, accounts: [account] });
      if (url.endsWith("/media/sync")) return json({ outcome: "succeeded" });
      if (url.endsWith("/media")) {
        mediaReads += 1;
        return json(mediaReads === 1 ? neverSynced : { ...neverSynced, sync: { ...neverSynced.sync, status: "succeeded", lastSuccessAt: "2026-10-15T12:00:00.000Z", completedAt: "2026-10-15T12:00:00.000Z", pagesRead: 1 } });
      }
      return json({}, 404);
    }));
    render(<InstagramPublications />);
    expect(await screen.findByRole("heading", { name: "Nenhuma publicação foi retornada" })).toBeInTheDocument();
    expect(screen.getByText("Total informado no perfil")).toBeInTheDocument();
    expect(screen.getByText("Itens já recebidos da aresta /media")).toBeInTheDocument();
    await waitFor(() => expect(requests).toEqual(expect.arrayContaining([{ url: expect.stringContaining("/media/sync"), method: "POST" }])));
    expect(screen.queryByText(/publicação fictícia/i)).not.toBeInTheDocument();
  });

  it("loads persisted posts without triggering a Meta synchronization on later visits", async () => {
    const stored = { ...neverSynced, storedCount: 1, loadedCount: 1, sync: { ...neverSynced.sync, status: "succeeded", lastSuccessAt: "2026-10-14T12:00:00.000Z" }, posts: [{
      id: "22222222-2222-4222-8222-222222222222", providerMediaId: "meta-1", caption: "Conteúdo público", publishedAt: "2026-10-12T12:00:00.000Z", permalink: "https://www.instagram.com/p/abc/", mediaType: "IMAGE", mediaProductType: "FEED", mediaUrl: "https://scontent.cdninstagram.com/image.jpg", thumbnailUrl: null, returnedFields: ["id", "media_type", "media_url"], fetchedAt: "2026-10-14T12:00:00.000Z", assets: [],
    }] };
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input); requests.push(url);
      if (url === "/api/integrations/meta/status") return json({ configured: true, accounts: [account] });
      if (url.endsWith("/media")) return json(stored);
      return json({}, 404);
    }));
    render(<InstagramPublications />);
    expect(await screen.findByText("Conteúdo público")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Imagem da publicação do Instagram" })).toHaveAttribute("src", "https://scontent.cdninstagram.com/image.jpg");
    expect(requests.some(url => url.endsWith("/media/sync"))).toBe(false);
  });

  it("navigates a carousel in the Meta child order using buttons, keyboard and touch", async () => {
    const stored = { ...neverSynced, storedCount: 1, loadedCount: 1, sync: { ...neverSynced.sync, status: "succeeded", lastSuccessAt: "2026-10-14T12:00:00.000Z" }, posts: [{
      id: "33333333-3333-4333-8333-333333333333", providerMediaId: "album-1", caption: null, publishedAt: null, permalink: "https://www.instagram.com/p/album/", mediaType: "CAROUSEL_ALBUM", mediaProductType: "FEED", mediaUrl: null, thumbnailUrl: null, returnedFields: ["id", "media_type", "children"], fetchedAt: "2026-10-14T12:00:00.000Z", assets: [
        { id: "asset-1", position: 0, mediaType: "IMAGE", mediaUrl: "https://scontent.cdninstagram.com/one.jpg", thumbnailUrl: null, returnedFields: ["id", "media_type", "media_url"] },
        { id: "asset-2", position: 1, mediaType: "IMAGE", mediaUrl: "https://scontent.cdninstagram.com/two.jpg", thumbnailUrl: null, returnedFields: ["id", "media_type", "media_url"] },
      ],
    }] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/integrations/meta/status" ? json({ configured: true, accounts: [account] }) : json(stored)));
    render(<InstagramPublications />);
    expect(await screen.findByRole("img", { name: "Item 1 do carrossel do Instagram" })).toHaveAttribute("src", "https://scontent.cdninstagram.com/one.jpg");
    expect(screen.queryByRole("img", { name: "Item 2 do carrossel do Instagram" })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    const viewport = screen.getByRole("group", { name: "Item 1 de 2" });
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    expect(await screen.findByRole("img", { name: "Item 2 do carrossel do Instagram" })).toHaveAttribute("src", "https://scontent.cdninstagram.com/two.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Ir para item 1 de 2" }));
    expect(await screen.findByRole("img", { name: "Item 1 do carrossel do Instagram" })).toBeInTheDocument();
    const activeViewport = screen.getByRole("group", { name: "Item 1 de 2" });
    fireEvent.pointerDown(activeViewport, { pointerType: "touch", clientX: 210 });
    fireEvent.pointerUp(activeViewport, { pointerType: "touch", clientX: 130 });
    expect(await screen.findByRole("img", { name: "Item 2 do carrossel do Instagram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Item anterior, 1 de 2" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Carrossel da publicação album-1" })).toHaveAttribute("aria-roledescription", "carrossel");
  });

  it("shows a first-visit error without fabricating an empty account state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/integrations/meta/status" ? json({ configured: true, accounts: [account] }) : json({}, 503)));
    render(<InstagramPublications />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível abrir as publicações.");
    expect(screen.queryByRole("heading", { name: "Nenhuma publicação foi retornada" })).not.toBeInTheDocument();
  });

  it("offers configuration when there is no connected professional account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ configured: true, accounts: [] })));
    render(<InstagramPublications />);
    expect(await screen.findByRole("heading", { name: "Conecte uma conta profissional" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir para configurações/ })).toHaveAttribute("href", "/configuracoes");
  });
});
