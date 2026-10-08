import { getValidAccessToken } from "../../../../lib/token-store";
import { NextResponse } from "next/server";

const resources = {
  contacts: "/api/contacts",
  segments: "/api/segments",
  campaigns: "/api/campaigns",
  emails: "/api/emails",
  forms: "/api/forms",
};

export async function GET(request) {
  // Never expose contact records through a publicly accessible diagnostics URL.
  const configuredKey = process.env.MAUTIC_BRIDGE_API_KEY;
  const providedKey = request.headers.get("x-bridge-api-key");
  if (!configuredKey) {
    return NextResponse.json({ ok: false, error: "bridge_key_not_configured" }, { status: 503 });
  }
  if (!providedKey || providedKey !== configuredKey) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const resource = url.searchParams.get("resource") || "contacts";
  if (!Object.hasOwn(resources, resource)) {
    return NextResponse.json({ ok: false, error: "invalid_resource" }, { status: 400 });
  }
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "10", 10) || 10));
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const search = (url.searchParams.get("search") || "").slice(0, 200);
  try {
    const token = await getValidAccessToken();
    const base = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
    if (!base) throw new Error("Mautic base URL is missing");
    const target = new URL(base + resources[resource]);
    target.searchParams.set("limit", String(limit));
    target.searchParams.set("start", String((page - 1) * limit));
    if (search) target.searchParams.set("search", search);
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "mautic_request_failed", status: response.status }, { status: 502 });
    }
    const data = await response.json();
    return NextResponse.json({ ok: true, resource, page, limit, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mautic resource listing failed", error);
    return NextResponse.json({ ok: false, error: "resource_request_failed" }, { status: 502 });
  }
}
