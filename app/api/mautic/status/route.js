import { NextResponse } from "next/server";
import { getStoredTokens } from "../../../../lib/token-store";

export async function GET() {
  try {
    const tokens = await getStoredTokens();
    if (!tokens) {
      return NextResponse.json({ ok: true, connected: false, message: "Mautic has not been authorized yet." });
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      has_refresh_token: Boolean(tokens.refresh_token),
      expires_at: tokens.expires_at,
      updated_at: tokens.updated_at,
    });
  } catch (error) {
    console.error("Mautic status check failed", error);
    return NextResponse.json({ ok: false, error: "status_failed", message: error.message }, { status: 500 });
  }
}
