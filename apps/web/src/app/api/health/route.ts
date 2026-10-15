import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return NextResponse.json({ status: "unavailable", reason: "api_error" }, { status: 502 });
    }
    const result: unknown = await response.json();
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "api_unreachable" }, { status: 503 });
  }
}
