import { afterEach, describe, expect, it, vi } from "vitest";
import { authRequest, AuthRequestError } from "./csrf";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("authRequest error parsing", () => {
  it("preserves a top-level error code from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "invalid_token",
      message: "Este link não é válido.",
    }), { status: 400, headers: { "content-type": "application/json" } })));

    await expect(authRequest("verify-email", { token: "invalid" })).rejects.toMatchObject({
      name: "AuthRequestError",
      code: "invalid_token",
      message: "Este link não é válido.",
    } satisfies Partial<AuthRequestError>);
  });

  it("preserves a nested error code from Nest responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { code: "token_expired", message: "Este link expirou." },
    }), { status: 400, headers: { "content-type": "application/json" } })));

    await expect(authRequest("verify-email", { token: "expired" })).rejects.toMatchObject({
      code: "token_expired",
      message: "Este link expirou.",
    });
  });
});
