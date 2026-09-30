import { NextResponse } from "next/server";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      { ok: false, error, description: url.searchParams.get("error_description") },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, error: "missing_code", message: "Mautic did not return an authorization code." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.MAUTIC_CLIENT_ID;
  const clientSecret = process.env.MAUTIC_CLIENT_SECRET;
  const redirectUri = process.env.MAUTIC_REDIRECT_URI;

  if (!baseUrl || !clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { ok: false, error: "server_configuration", message: "Required Mautic environment variables are missing." },
      { status: 500 }
    );
  }

  const tokenResponse = await fetch(`${baseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    cache: "no-store",
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok) {
    return NextResponse.json(
      { ok: false, error: "token_exchange_failed", details: tokenData },
      { status: tokenResponse.status }
    );
  }

  // Do not expose OAuth tokens in the browser response.
  return NextResponse.json({
    ok: true,
    connected: true,
    message: "OAuth authorization succeeded. Token exchange completed securely on the server.",
    expires_in: tokenData.expires_in ?? null,
  });
}
