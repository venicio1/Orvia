import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileWorkflow } from "./profile-workflow";
import { authRequest } from "@/lib/csrf";
import type { ProfessionalProfile } from "@/lib/auth";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/csrf", () => ({ authRequest: vi.fn() }));

const profile: ProfessionalProfile = {
  professionalName: "Perfil fictício", profession: "Psicologia", specialty: "Geral", city: "Curitiba", region: "Paraná",
  serviceMode: "Online", targetAudience: "Adultos", professionalGoals: [], weeklyTimeMinutes: 120,
  socialExperience: "Estou começando", postingFrequency: "Ainda não publico", communicationPreferences: [],
  onboardingStep: 0, onboardingCompletedAt: null,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ProfileWorkflow save feedback", () => {
  it("announces successful profile saves in a polite status region", async () => {
    vi.mocked(authRequest).mockResolvedValue({});
    render(<ProfileWorkflow mode="edit" initialProfile={profile} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Seu perfil foi salvo"));
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(authRequest).toHaveBeenCalledWith("profile", expect.objectContaining({ professionalName: "Perfil fictício" }), "PATCH");
  });

  it("announces save failures in an assertive alert region", async () => {
    vi.mocked(authRequest).mockRejectedValue(new Error("Falha de conexão."));
    render(<ProfileWorkflow mode="edit" initialProfile={profile} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    const error = await screen.findByText("Falha de conexão.");
    expect(error.closest('[role="alert"]')).toHaveAttribute("aria-live", "assertive");
  });
});
