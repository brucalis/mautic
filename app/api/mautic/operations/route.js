import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getValidAccessToken } from "../../../../lib/token-store";

const resources = Object.freeze({
  contacts: "/api/contacts",
  segments: "/api/segments"
});
function authorized(request) {
  const key = process.env.MAUTIC_BRIDGE_API_KEY;
  const provided = request.headers.get("x-bridge-api-key");
  if (!key || !provided) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function POST(request) {
  if (!process.env.MAUTIC_BRIDGE_API_KEY)
    return NextResponse.json({ ok: false, error: "bridge_key_not_configured" }, { status: 503 });
  if (!authorized(request))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const { resource, action, confirm } = body ?? {};
  // GPT Actions may flatten schema properties instead of nesting them in payload.
  const payload = body?.payload ?? (resource === "segments"
    ? { name: body?.name, description: body?.description }
    : { email: body?.email, firstname: body?.firstname, lastname: body?.lastname, mobile: body?.mobile });
  if (!Object.hasOwn(resources, resource) || action !== "create")
    return NextResponse.json({ ok: false, error: "unsupported_operation" }, { status: 400 });
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  // This endpoint intentionally cannot modify Mautic without an explicit confirmation flag.
  if (confirm !== true)
    return NextResponse.json({ ok: true, dry_run: true, resource, action, payload: Object.fromEntries(Object.entries(payload).filter(([, value]) => typeof value === "string" || typeof value === "boolean")), message: "No data changed. Explicit user approval and confirm:true are required to create." });
  const allowed = resource === "contacts"
    ? ["firstname", "lastname", "email", "mobile", "phone", "company", "city", "country"]
    : ["name", "description", "isPublished"];
  const safePayload = Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
    allowed.includes(key) && (typeof value === "string" || typeof value === "boolean")
  ));
  if (resource === "contacts" && (!safePayload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safePayload.email)))
    return NextResponse.json({ ok: false, error: "valid_email_required" }, { status: 400 });
  if (resource === "segments" && (!safePayload.name || !safePayload.name.trim()))
    return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  try {
    const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) throw new Error("Missing Mautic URL");
    const token = await getValidAccessToken();
    const response = await fetch(baseUrl + resources[resource] + "/new", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(safePayload),
      cache: "no-store"
    });
    if (!response.ok) {
      console.error("Mautic create request failed", resource, response.status);
      return NextResponse.json({ ok: false, error: "mautic_create_failed", status: response.status }, { status: 502 });
    }
    const data = await response.json().catch(() => ({}));
    const entity = data[resource === "contacts" ? "contact" : "list"] ?? {};
    return NextResponse.json({ ok: true, created: true, resource, id: entity.id ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mautic create operation failed", error);
    return NextResponse.json({ ok: false, error: "operation_failed" }, { status: 502 });
  }
}
