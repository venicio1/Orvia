// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("same-origin API proxy redirects", () => {
  it("passes the OAuth callback redirect to the browser without following it server-side", async () => {
    const location = "http://localhost:3000/configuracoes?meta=connected";
    const proxyFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(null, { status: 303, headers: { location, "referrer-policy": "no-referrer" } });
    });
    vi.stubGlobal("fetch", proxyFetch);

    const response = await GET(new NextRequest("http://localhost:3000/api/integrations/meta/callback?code=redacted&state=redacted"));

    expect(proxyFetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(location);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
