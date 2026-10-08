import { NextResponse } from "next/server";
import { getValidAccessToken } from "../../../../lib/token-store";

export async function GET() {
  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return NextResponse.json({ ok: false, error: "missing_base_url" }, { status: 503 });
  try {
    const token = await getValidAccessToken();
    const paths = ["/api/contacts?limit=1", "/api/contacts/list/fields", "/api/segments?limit=1", "/api/campaigns?limit=1"];
    const results = [];
    for (const path of paths) {
      const response = await fetch(baseUrl + path, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store"
      });
      // Never return contact records, response bodies, or raw provider errors.
      results.push({ resource: path.split("?")[0], status: response.status, ok: response.ok });
    }
    return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Mautic diagnostic failed", error);
    return NextResponse.json({ ok: false, error: "diagnostic_failed" }, { status: 502 });
  }
}
