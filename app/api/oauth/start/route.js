import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.MAUTIC_CLIENT_ID;
  const redirectUri = process.env.MAUTIC_REDIRECT_URI;
  if (!baseUrl || !clientId || !redirectUri) {
    return NextResponse.json({ ok: false, error: "server_configuration" }, { status: 500 });
  }
  const state = randomBytes(32).toString("hex");
  const authorize = new URL(`${baseUrl}/oauth/v2/authorize`);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set("mautic_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/callback", maxAge: 600
  });
  return response;
}
