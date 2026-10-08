import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { saveTokens } from "../../../../lib/token-store";

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("mautic_oauth_state")?.value;
  const validState = state && expected && state.length === expected.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(expected));
  if (!validState) {
    return NextResponse.json({ ok: false, error: "invalid_oauth_state" }, { status: 400 });
  }
  const respond = (body, status = 200) => {
    const response = NextResponse.json(body, { status });
    response.cookies.delete("mautic_oauth_state");
    return response;
  };
  const error = url.searchParams.get("error");
  if (error) return respond({ ok: false, error: "authorization_denied" }, 400);
  const code = url.searchParams.get("code");
  if (!code) return respond({ ok: false, error: "missing_code" }, 400);
  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.MAUTIC_CLIENT_ID;
  const clientSecret = process.env.MAUTIC_CLIENT_SECRET;
  const redirectUri = process.env.MAUTIC_REDIRECT_URI;
  if (!baseUrl || !clientId || !clientSecret || !redirectUri)
    return respond({ ok: false, error: "server_configuration" }, 500);
  try {
    const tokenResponse = await fetch(`${baseUrl}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: clientId,
        client_secret: clientSecret, redirect_uri: redirectUri, code
      }),
      cache: "no-store"
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token)
      return respond({ ok: false, error: "token_exchange_failed" }, 502);
    await saveTokens(tokenData);
    return respond({ ok: true, connected: true, persisted: true, message: "Mautic authorization succeeded." });
  } catch (error) {
    console.error("Mautic authorization callback failed", error);
    return respond({ ok: false, error: "authorization_callback_failed" }, 500);
  }
}
