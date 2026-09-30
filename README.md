# Mautic ChatGPT Bridge

Small Next.js bridge for Mautic OAuth and future API operations.

## OAuth callback

`/api/mautic/callback`

## Health check

`/api/health`

## Environment variables

Future OAuth token exchange will use environment variables stored in Vercel, not committed to this repository.

- `MAUTIC_BASE_URL`
- `MAUTIC_CLIENT_ID`
- `MAUTIC_CLIENT_SECRET`
- `APP_BASE_URL`

Do not commit credentials or tokens.
