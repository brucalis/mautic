import { NextResponse } from "next/server";
import { getValidAccessToken } from "../../../../lib/token-store";

export async function GET() {
  try {
    const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) throw new Error("MAUTIC_BASE_URL is not configured.");

    const accessToken = await getValidAccessToken();
    const response = await fetch(`${baseUrl}/api/contacts?limit=1`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, connected: false, status: response.status, error: "mautic_api_failed", details: data },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      api: "Mautic",
      message: "Authenticated API request succeeded.",
      total_contacts: data.total ?? null,
    });
  } catch (error) {
    console.error("Mautic API test failed", error);
    return NextResponse.json({ ok: false, connected: false, error: "test_failed", message: error.message }, { status: 500 });
  }
}
