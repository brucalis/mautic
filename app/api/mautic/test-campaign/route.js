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
      const raw = await response.text().catch(() => "");
      let upstreamBody = null;
      try { upstreamBody = JSON.parse(raw); } catch { /* HTML/plain-text responses are not returned to callers. */ }
      const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
      const safeField = (value) => typeof value === "string" && /^(name|description|isPublished|publishUp|publishDown|category|campaign|form|segment|events|source|type|id)$/.test(value);
      const errors = upstreamBody?.errors;
      const entries = Array.isArray(errors) ? errors : isObject(errors) ? Object.entries(errors).map(([field, value]) => ({ field, value })) : [];
      const validation_fields = [...new Set(entries.flatMap((entry) => {
        if (!isObject(entry)) return [];
        return [entry.field, entry.propertyPath, entry.property, entry.path, entry?.value?.field].filter(safeField);
      }))].slice(0, 15);
      const upstream_code = Number.isInteger(upstreamBody?.error?.code) ? upstreamBody.error.code
        : Number.isInteger(upstreamBody?.errors?.[0]?.code) ? upstreamBody.errors[0].code : null;
      const response_format = upstreamBody === null ? (raw.trim().startsWith("<") ? "html" : raw ? "text" : "empty")
        : Array.isArray(upstreamBody) ? "json_array" : "json_object";
      const response_keys = isObject(upstreamBody)
        ? Object.keys(upstreamBody).filter((key) => /^(errors|error|message|detail|title|status|code|campaign|success)$/.test(key))
        : [];
      const error_shape = Array.isArray(errors) ? "array" : isObject(errors) ? "object" : typeof errors;
      console.error("Mautic campaign create rejected", { status: response.status, response_format, response_keys, error_shape, validation_fields, upstream_code });
      return NextResponse.json({
        ok: false,
        error: "mautic_campaign_create_failed",
        upstream_status: response.status,
        validation_fields,
        upstream_code,
        response_format,
        response_keys,
        error_shape
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
