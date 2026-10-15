import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/csrf", () => ({ authRequest: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function emulateMobileViewport() {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

describe("AppShell mobile navigation", () => {
  it("exposes one controlled, keyboard-operable navigation drawer", async () => {
    emulateMobileViewport();
    const { container } = render(<AppShell active="inicio"><p>Conteúdo</p></AppShell>);

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    const sidebar = container.querySelector("#orvia-sidebar") as HTMLElement;
    await waitFor(() => expect(sidebar).toHaveAttribute("inert"));
    expect(menuButton).toHaveAttribute("aria-controls", "orvia-sidebar");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    const closeButton = screen.getByRole("button", { name: "Fechar menu" });
    await waitFor(() => expect(menuButton).toHaveAttribute("aria-expanded", "true"));
    expect(sidebar).toHaveAttribute("role", "dialog");
    expect(sidebar).toHaveAttribute("aria-modal", "true");
    expect(sidebar).not.toHaveAttribute("inert");
    expect(document.activeElement).toBe(closeButton);

    screen.getByRole("button", { name: "Sair" }).focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Orvia, início" }));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(menuButton).toHaveAttribute("aria-expanded", "false"));
    expect(sidebar).toHaveAttribute("inert");
    expect(document.activeElement).toBe(menuButton);
  });

});
