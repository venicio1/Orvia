"use client";

export class AuthRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = "AuthRequestError"; }
}

export function csrfToken() {
  return document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith("orvia_csrf="))?.slice("orvia_csrf=".length) ?? "";
}

export async function authRequest(path: string, body?: unknown, method = "POST") {
  const response = await fetch(`/api/auth/${path}`, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const details = errorPayload.message;
    const nestedDetails = typeof details === "object" && details !== null ? details as Record<string, unknown> : {};
    const message = typeof details === "object" && details !== null && "message" in details ? String(details.message)
      : Array.isArray(details) ? details.join(" ") : typeof details === "string" ? details
      : "Não foi possível concluir. Tente novamente.";
    const rawCode = nestedDetails.code ?? errorPayload.code;
    const code = typeof rawCode === "string" ? rawCode : undefined;
    throw new AuthRequestError(message, code);
  }
  return payload;
}
