import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "./dashboard";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Dashboard API state", () => {
  it("shows a real loading state and then confirms a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }));
    render(<Dashboard />);
    expect(screen.getByRole("status")).toHaveTextContent("Verificando a API");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("API respondendo"));
  });

  it("shows an actionable error when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Dashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível conectar à API");
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it("shows honest empty states when no product data exists", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }));
    render(<Dashboard />);
    expect(screen.getByText("Nenhuma observação disponível")).toBeInTheDocument();
    expect(screen.getByText("Sem registros neste período")).toBeInTheDocument();
  });
});
