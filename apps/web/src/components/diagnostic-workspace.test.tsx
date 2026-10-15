import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiagnosticWorkspace } from "./diagnostic-workspace";
import { authRequest } from "@/lib/csrf";

vi.mock("@/lib/csrf", () => ({ authRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const record = {
  id: "abdfaa6e-44e3-44ad-bf1e-12d27d822e26", version: 1, criteriaVersion: "orvia-diagnostico-1.1.0", status: "current" as const, reviewedAt: null, createdAt: "2026-10-15T10:00:00.000Z",
  result: {
    professionalSummary: "Você informou profissão: Psicóloga.", summary: "Perfil com informações de partida.", score: 50, scoreLabel: "Organização das informações do perfil", scoreMethod: "Média simples de quatro dimensões.", evidenceBoundary: "Somente perfil informado.",
    dimensions: [{ id: "fundamentos", label: "Fundamentos do perfil", score: 50, explanation: "Campos preenchidos.", evidence: ["Profissão informada: Psicóloga"], missing: ["Campo ausente: Região"] }],
    strengths: ["Você informou um objetivo."], opportunities: [{ title: "Campo ausente: Região", reason: "Não consta no perfil." }], limitations: ["Sem consulta externa."],
  },
  strategy: { plan: { objective: "Comunicar com clareza", weeklyBudgetHours: 1, priorities: [{ title: "Comunicar meu trabalho com clareza", rationale: "Objetivo do perfil.", actions: [{ title: "Rascunhar uma explicação educativa", description: "Um próximo passo.", why: "É observável.", effortHours: 0.5, indicator: "Ação registrada", sequence: 1 }] }], estimateNote: "Estimativa aproximada.", indicators: ["Ação registrada"], guardrails: ["Não prometa resultado."] } },
};

describe("DiagnosticWorkspace", () => {
  it("shows an honest empty state, generates on request, and announces success", async () => {
    vi.mocked(authRequest).mockResolvedValueOnce({ diagnostics: [] }).mockResolvedValueOnce({ diagnostic: record });
    render(<DiagnosticWorkspace />);
    expect(await screen.findByRole("heading", { name: "Seu primeiro diagnóstico começa pelo perfil" })).toBeInTheDocument();
    expect(screen.getByText(/não consulta redes sociais, tendências, audiência ou dados de pacientes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar meu diagnóstico" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Diagnóstico atualizado");
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Versão 1")).toBeInTheDocument();
    expect(authRequest).toHaveBeenNthCalledWith(2, "diagnostics", {}, "POST");
  });

  it("renders explanation, missing fields, strategy estimates, and lets the user mark review", async () => {
    const reviewed = { ...record, reviewedAt: "2026-10-15T11:00:00.000Z" };
    vi.mocked(authRequest).mockResolvedValueOnce({ diagnostics: [record] }).mockResolvedValueOnce({ diagnostic: reviewed });
    render(<DiagnosticWorkspace />);
    expect(await screen.findByRole("heading", { name: "Dimensões consideradas" })).toBeInTheDocument();
    expect(screen.getByText("Campo ausente: Região")).toBeInTheDocument();
    expect(screen.getByText("Rascunhar uma explicação educativa")).toBeInTheDocument();
    expect(screen.getByText("0.5 h")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Fundamentos do perfil" })).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Você informou profissão: Psicóloga.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Revisado em/ })).toBeInTheDocument());
    expect(authRequest).toHaveBeenNthCalledWith(2, `diagnostics/${record.id}/review`, {}, "PATCH");
  });

  it("marks the previous version as historical immediately after refresh", async () => {
    const next = { ...record, id: "c4351951-bfcc-4fce-8bdc-e055902b0d39", version: 2, createdAt: "2026-10-15T12:00:00.000Z" };
    vi.mocked(authRequest).mockResolvedValueOnce({ diagnostics: [record] }).mockResolvedValueOnce({ diagnostic: next });
    render(<DiagnosticWorkspace />);
    expect(await screen.findByRole("button", { name: /Versão 1 · atual/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar diagnóstico com o perfil atual" }));
    expect(await screen.findByRole("button", { name: /Versão 2 · atual/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Versão 1 · histórico/ })).toBeInTheDocument();
  });

  it("shows a real loading failure and offers retry", async () => {
    vi.mocked(authRequest).mockRejectedValueOnce(new Error("Falha de conexão.")).mockResolvedValueOnce({ diagnostics: [] });
    render(<DiagnosticWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de conexão.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { name: "Seu primeiro diagnóstico começa pelo perfil" })).toBeInTheDocument();
  });

  it("announces generation failures without showing a fabricated result", async () => {
    vi.mocked(authRequest).mockResolvedValueOnce({ diagnostics: [] }).mockRejectedValueOnce(new Error("Não foi possível salvar."));
    render(<DiagnosticWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: "Gerar meu diagnóstico" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar.");
    expect(screen.getByRole("heading", { name: "Seu primeiro diagnóstico começa pelo perfil" })).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });
});
