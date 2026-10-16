import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MetaConnectionPanel } from "./meta-connection-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("MetaConnectionPanel", () => {
  it("explains that Meta is not configured and does not offer a fake connect action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ configured: false, requiredScopes: ["pages_show_list", "instagram_basic", "pages_read_engagement"], optionalFutureScopes: ["instagram_manage_insights"], accounts: [] })));
    render(<MetaConnectionPanel />);
    expect(await screen.findByText(/autorização real está desativada/i)).toBeInTheDocument();
    expect(screen.getByText(/O Orvia ainda não consulta dados do Instagram/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continuar para a Meta/i })).not.toBeInTheDocument();
  });

  it("shows the real connected account state and supports scoped disconnection", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [{ id: "account-1", providerAccountId: "ig-1", pageName: "Consultório", username: "psico.teste", grantedScopes: ["pages_show_list"], tokenExpiresAt: null, status: "connected", connectedAt: "2026-10-15T12:00:00.000Z", profileReauthorizationRequired: false, profileSnapshot: { username: "psico.teste", name: "Perfil Teste", biography: "Bio real", profilePictureUrl: null, followersCount: 120, followsCount: 90, mediaCount: 4, website: "https://example.org", returnedFields: ["username", "name", "biography", "followers_count", "follows_count", "media_count", "website"], source: "instagram_graph_api", apiVersion: "v26.0", fetchedAt: "2026-10-15T12:30:00.000Z" }, syncRuns: [{ status: "succeeded", startedAt: "2026-10-15T12:30:00.000Z", finishedAt: "2026-10-15T12:30:00.000Z", errorCode: null }] }] }))
      .mockResolvedValueOnce(response({ message: "A conexão foi removida e a credencial armazenada foi apagada." }))
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<MetaConnectionPanel />);
    expect((await screen.findAllByText("@psico.teste")).length).toBeGreaterThan(0);
    expect(screen.getByText("Estas contas foram conectadas ao Orvia. Você pode desconectar cada uma individualmente.")).toBeInTheDocument();
    expect(screen.getByText("Seguidores")).toBeInTheDocument();
    expect(screen.getByText(/Instagram Graph API da Meta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar @psico.teste" }));
    expect(await screen.findByRole("status")).toHaveTextContent("credencial armazenada foi apagada");
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/integrations/meta/accounts/account-1", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByText("Não conectada")).toBeInTheDocument();
  });

  it("starts the first real profile read after connection and renders its source and timestamp", async () => {
    const account = { id: "account-1", providerAccountId: "ig-1", pageName: "Consultório", username: "unicstreetbr", grantedScopes: [], tokenExpiresAt: null, status: "connected", connectedAt: "2026-10-15T12:00:00.000Z", profileReauthorizationRequired: false };
    const snapshot = { username: "unicstreetbr", name: "Unic Street", biography: "Perfil profissional", profilePictureUrl: null, followersCount: 321, followsCount: 123, mediaCount: 45, website: null, returnedFields: ["username", "name", "biography", "followers_count", "follows_count", "media_count", "website"], source: "instagram_graph_api", apiVersion: "v26.0", fetchedAt: "2026-10-15T12:30:00.000Z" };
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [{ ...account, profileSnapshot: null, syncRuns: [] }] }))
      .mockResolvedValueOnce(response({ outcome: "succeeded" }))
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [{ ...account, profileSnapshot: snapshot, syncRuns: [{ status: "succeeded", startedAt: snapshot.fetchedAt, finishedAt: snapshot.fetchedAt, errorCode: null }] }] }));
    vi.stubGlobal("fetch", fetch);
    render(<MetaConnectionPanel />);
    expect(await screen.findByText("Unic Street")).toBeInTheDocument();
    expect(await screen.findByText(/API v26.0/)).toBeInTheDocument();
    expect(screen.getByText("321")).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/integrations/meta/accounts/account-1/profile/sync", expect.objectContaining({ method: "POST" }));
  });

  it("shows the last snapshot with a stale notice after a later sync failure", async () => {
    const snapshot = { username: "unicstreetbr", name: "Perfil", biography: null, profilePictureUrl: null, followersCount: 0, followsCount: null, mediaCount: 2, website: null, returnedFields: ["username", "name", "biography", "followers_count", "follows_count", "media_count", "website"], source: "instagram_graph_api", apiVersion: "v26.0", fetchedAt: "2026-10-15T12:00:00.000Z" };
    vi.stubGlobal("fetch", vi.fn(async () => response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [{ id: "account-1", providerAccountId: "ig-1", pageName: "Página", username: "unicstreetbr", grantedScopes: [], tokenExpiresAt: null, status: "connected", connectedAt: "2026-10-15T12:00:00.000Z", profileReauthorizationRequired: false, profileSnapshot: snapshot, syncRuns: [{ status: "failed", startedAt: "2026-10-15T13:00:00.000Z", finishedAt: "2026-10-15T13:00:01.000Z", errorCode: "graph_http_500" }] }] })));
    render(<MetaConnectionPanel />);
    expect(await screen.findByText(/A atualização mais recente falhou\. Exibindo o último snapshot válido/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText(/não informado/i).length).toBeGreaterThan(0);
  });

  it("renders callback failures as clear status messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ configured: false, requiredScopes: [], optionalFutureScopes: [], accounts: [] })));
    render(<MetaConnectionPanel callbackResult="pages_without_instagram" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Páginas acessíveis, mas nenhuma retornou uma conta Instagram profissional/i);
  });

  it("offers Page ID validation only after the provider returned an empty Page list", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [] }))
      .mockResolvedValueOnce(response({ outcome: "page_not_authorized" }));
    vi.stubGlobal("fetch", fetch);
    render(<MetaConnectionPanel callbackResult="page_id_required" />);
    expect(await screen.findByRole("textbox", { name: /ID da Página do Facebook/i })).toBeInTheDocument();
    expect(screen.getByText(/ID, sozinho, não concede acesso/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /ID da Página do Facebook/i }), { target: { value: "123456789" } });
    fireEvent.click(screen.getByRole("button", { name: /Validar Página/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Meta não confirmou autorização/i);
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/integrations/meta/connect/page", expect.objectContaining({ method: "POST", body: JSON.stringify({ pageId: "123456789" }) }));
  });
});
