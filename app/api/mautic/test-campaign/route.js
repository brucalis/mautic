import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getValidAccessToken } from "../../../../lib/token-store";

function authorized(request) {
  const expected = process.env.MAUTIC_BRIDGE_API_KEY;
  const actual = request.headers.get("x-bridge-api-key");
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (body?.action !== "create_test_campaign") return NextResponse.json({ ok: false, error: "unsupported_action" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 150) return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  const draft = { name, description: "Campanha de teste criada pelo ChatGPT. Sem envio WhatsApp, sem eventos e despublicada.", isPublished: false };
  if (body.confirm !== true) return NextResponse.json({ ok: true, dry_run: true, campaign: draft, message: "No changes made. Set confirm:true only after explicit user approval." });
  // Safety: this route creates only an unpublished empty campaign, never contacts, events, webhooks or WhatsApp messages.
  try {
    const base = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
    if (!base) return NextResponse.json({ ok: false, error: "mautic_not_configured" }, { status: 503 });
    const token = await getValidAccessToken();
    const response = await fetch(base + "/api/campaigns/new", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(draft),
      cache: "no-store"
    });
    if (!response.ok) {
      let upstreamBody = null;
      try { upstreamBody = await response.json(); } catch { /* Mautic may return HTML or an empty body. */ }
      // Expose only validation field names and machine-readable error codes, never raw upstream text or user data.
      const errors = upstreamBody && typeof upstreamBody === "object" ? upstreamBody.errors : null;
      const validation_fields = errors && typeof errors === "object" && !Array.isArray(errors)
        ? Object.keys(errors).filter((key) => /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(key)).slice(0, 15)
        : [];
      const upstream_code = typeof upstreamBody?.error?.code === "number"
        ? upstreamBody.error.code : null;
      console.error("Mautic campaign create rejected", { status: response.status, validation_fields, upstream_code });
      return NextResponse.json({
        ok: false,
        error: "mautic_campaign_create_failed",
        upstream_status: response.status,
        validation_fields,
        upstream_code
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const data = await response.json().catch(() => ({}));
    const campaign = data.campaign ?? {};
    return NextResponse.json({ ok: true, created: true, id: campaign.id ?? null, name: campaign.name ?? name, isPublished: false, sending_enabled: false, events_created: false, contacts_added: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mautic test campaign create failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "campaign_create_failed" }, { status: 502 });
  }
}
