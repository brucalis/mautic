import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.MAUTIC_CLIENT_ID;
  const redirectUri = process.env.MAUTIC_REDIRECT_URI;

  if (!baseUrl || !clientId || !redirectUri) {
    return NextResponse.json(
      { ok: false, error: "server_configuration", message: "Required Mautic environment variables are missing." },
      { status: 500 }
    );
  }

  const authorize = new URL(`${baseUrl}/oauth/v2/authorize`);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");

  return NextResponse.redirect(authorize);
}
