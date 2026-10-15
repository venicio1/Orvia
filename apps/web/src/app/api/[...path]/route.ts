import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest) {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
  const path = request.nextUrl.pathname.replace(/^\/api\//, "");
  if (!path.startsWith("auth/") && !path.startsWith("diagnostics")) return Response.json({ code: "not_found", message: "Rota não encontrada." }, { status: 404 });
  const headers = new Headers();
  for (const name of ["content-type", "cookie", "origin", "x-csrf-token", "user-agent", "x-forwarded-for"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/${path}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const outputHeaders = new Headers({ "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
    for (const cookie of response.headers.getSetCookie()) outputHeaders.append("set-cookie", cookie);
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  } catch {
    return Response.json({ code: "api_unavailable", message: "O serviço Orvia está indisponível no momento." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
