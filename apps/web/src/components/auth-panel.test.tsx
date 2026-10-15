import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuthPanel } from "./auth-panel";
import { authRequest } from "@/lib/csrf";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/csrf", () => ({ authRequest: vi.fn(), AuthRequestError: class AuthRequestError extends Error { constructor(message: string, readonly code?: string) { super(message); } } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AuthPanel identity feedback", () => {
  it("does not apply the account-creation minimum to login passwords", async () => {
    vi.mocked(authRequest).mockResolvedValue({});
    render(<AuthPanel mode="login" />);
    const password = screen.getByLabelText("Senha") as HTMLInputElement;
    expect(password.minLength).toBe(-1);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pro@example.com" } });
    fireEvent.change(password, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no Orvia" }));
    await waitFor(() => expect(authRequest).toHaveBeenCalledWith("login", { email: "pro@example.com", password: "short" }));
  });

  it("keeps signup feedback non-enumerable and does not claim an account was created", async () => {
    vi.mocked(authRequest).mockResolvedValue({});
    render(<AuthPanel mode="register" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pro@example.com" } });
    const signupPassword = screen.getByText("Use pelo menos 12 caracteres.").previousElementSibling as HTMLInputElement;
    fireEvent.change(signupPassword, { target: { value: "a sufficiently long password" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "a sufficiently long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    const feedback = await screen.findByRole("status");
    expect(feedback).toHaveTextContent("Se o cadastro puder prosseguir");
    expect(within(feedback).getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
    expect(within(feedback).getByRole("link", { name: "Recuperar senha" })).toHaveAttribute("href", "/recuperar-acesso");
    expect(within(feedback).getByRole("button", { name: "Solicitar confirmação" })).toBeInTheDocument();
    expect(screen.queryByText(/Conta criada/i)).not.toBeInTheDocument();
  });

  it("keeps the same privacy-safe response and offers explicit confirmation resend", async () => {
    vi.mocked(authRequest).mockResolvedValue({});
    render(<AuthPanel mode="register" />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pro@example.com" } });
    const signupPassword = screen.getByText("Use pelo menos 12 caracteres.").previousElementSibling as HTMLInputElement;
    fireEvent.change(signupPassword, { target: { value: "a sufficiently long password" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "a sufficiently long password" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await screen.findByRole("link", { name: "Recuperar senha" });
    fireEvent.click(screen.getByRole("button", { name: "Solicitar confirmação" }));
    await waitFor(() => expect(authRequest).toHaveBeenLastCalledWith("resend-verification", { email: "pro@example.com" }));
    expect(screen.getByRole("status")).toHaveTextContent("A resposta é sempre a mesma para proteger sua privacidade");
    const feedback = screen.getByRole("status");
    expect(within(feedback).getByRole("link", { name: "Entrar" })).toBeInTheDocument();
    expect(within(feedback).getByRole("link", { name: "Recuperar senha" })).toBeInTheDocument();
  });

  it("replaces confirmation action with a prominent login action after success", async () => {
    vi.mocked(authRequest).mockResolvedValue({});
    render(<AuthPanel mode="verify" token="valid-token" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e-mail" }));
    expect(await screen.findByText("Sua conta está pronta para entrar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar e-mail" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar no Orvia" })).toBeInTheDocument();
  });

  it("explains expired confirmation links and offers a replacement path", async () => {
    const { AuthRequestError: RequestError } = await import("@/lib/csrf");
    vi.mocked(authRequest).mockRejectedValue(new RequestError("Este link expirou. Solicite outro.", "token_expired"));
    render(<AuthPanel mode="verify" token="expired-token" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e-mail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expirou ou já foi utilizado");
    expect(screen.queryByRole("button", { name: "Confirmar e-mail" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert").querySelector('a[href="/entrar"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "Solicitar novo link" })).toBeInTheDocument();
  });

  it("offers login and resend actions for an invalid confirmation token", async () => {
    const { AuthRequestError: RequestError } = await import("@/lib/csrf");
    vi.mocked(authRequest).mockRejectedValue(new RequestError("Token inválido.", "invalid_token"));
    render(<AuthPanel mode="verify" token="invalid-token" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e-mail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este link não é válido");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
    expect(screen.getByRole("link", { name: "Solicitar novo link" })).toHaveAttribute("href", "/reenviar-confirmacao");
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
  });

  it("offers a resend path when the confirmation token is missing", () => {
    render(<AuthPanel mode="verify" />);
    expect(screen.getByRole("alert")).toHaveTextContent("link de confirmação está ausente");
    expect(screen.getByRole("link", { name: "Solicitar novo link" })).toHaveAttribute("href", "/reenviar-confirmacao");
    expect(screen.queryByRole("button", { name: "Confirmar e-mail" })).not.toBeInTheDocument();
  });

  it("explains confirmation is user initiated before making a request", () => {
    render(<AuthPanel mode="verify" token="valid-token" />);
    expect(screen.getByRole("status")).toHaveTextContent("só será usado quando você confirmar");
    expect(screen.getByText(/Use o botão abaixo para confirmar/)).toBeInTheDocument();
    expect(authRequest).not.toHaveBeenCalled();
  });

  it("keeps a retry action when the confirmation service cannot be reached", async () => {
    vi.mocked(authRequest).mockRejectedValue(new TypeError("offline"));
    render(<AuthPanel mode="verify" token="valid-token" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e-mail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Verifique sua conexão");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
