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
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [{ id: "account-1", providerAccountId: "ig-1", pageName: "Consultório", username: "psico.teste", grantedScopes: ["pages_show_list"], tokenExpiresAt: null, status: "connected", connectedAt: "2026-10-15T12:00:00.000Z" }] }))
      .mockResolvedValueOnce(response({ message: "A conexão foi removida e a credencial armazenada foi apagada." }))
      .mockResolvedValueOnce(response({ configured: true, requiredScopes: [], optionalFutureScopes: [], accounts: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<MetaConnectionPanel />);
    expect(await screen.findByText("@psico.teste")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar @psico.teste" }));
    expect(await screen.findByRole("status")).toHaveTextContent("credencial armazenada foi apagada");
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/integrations/meta/accounts/account-1", expect.objectContaining({ method: "DELETE" }));
    expect(await screen.findByText("Não conectada")).toBeInTheDocument();
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
