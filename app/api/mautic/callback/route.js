import { NextResponse } from "next/server";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({
      ok: true,
      message: "Mautic OAuth callback endpoint is online.",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Authorization code received.",
    code_received: true,
  });
}
