import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.STORAGE_URL
  );
}

function db() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return neon(url);
}

export async function ensureTokenTable() {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS mautic_oauth_tokens (
      id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      expires_at TIMESTAMPTZ,
      scope TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function saveTokens(tokenData) {
  await ensureTokenTable();
  const sql = db();
  const expiresIn = Number(tokenData.expires_in || 3600);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await sql`
    INSERT INTO mautic_oauth_tokens
      (id, access_token, refresh_token, token_type, expires_at, scope, updated_at)
    VALUES
      ('primary', ${tokenData.access_token}, ${tokenData.refresh_token || null}, ${tokenData.token_type || 'Bearer'}, ${expiresAt}, ${tokenData.scope || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, mautic_oauth_tokens.refresh_token),
      token_type = EXCLUDED.token_type,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      updated_at = NOW()
  `;
}

export async function getStoredTokens() {
  await ensureTokenTable();
  const sql = db();
  const rows = await sql`
    SELECT access_token, refresh_token, token_type, expires_at, scope, updated_at
    FROM mautic_oauth_tokens
    WHERE id = 'primary'
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getValidAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens) throw new Error("Mautic is not authorized yet.");

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Mautic access token expired and no refresh token is available.");

  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  const clientId = process.env.MAUTIC_CLIENT_ID;
  const clientSecret = process.env.MAUTIC_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) throw new Error("Mautic OAuth configuration is incomplete.");

  const response = await fetch(`${baseUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Mautic token refresh failed (${response.status}).`);
  }

  await saveTokens(data);
  tokens = await getStoredTokens();
  return tokens.access_token;
}
