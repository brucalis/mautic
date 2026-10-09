import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

function authorized(request) {
  const expected = process.env.MAUTIC_BRIDGE_API_KEY;
  const provided = request.headers.get("x-bridge-api-key");
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const base = process.env.BAILEYS_BASE_URL;
  const key = process.env.BAILEYS_API_KEY;
  if (!base || !key) return NextResponse.json({
    ok: true, configured: false, dry_run: true, sending_enabled: false,
    next_step: "Set BAILEYS_BASE_URL and BAILEYS_API_KEY on Vercel. No messages can be sent."
  }, { headers: { "Cache-Control": "no-store" } });
  try {
    const url = new URL("/api/integrations/mautic/capabilities", base);
    if (url.protocol !== "https:") throw new Error("https_required");
    const response = await fetch(url, {
      headers: { "x-api-key": key }, cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "baileys_unavailable", status: response.status }, { status: 502 });
    const capabilities = await response.json();
    return NextResponse.json({
      ok: true, configured: true, dry_run: true, sending_enabled: false,
      baileys: capabilities,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "baileys_connection_failed" }, { status: 502 });
  }
}
