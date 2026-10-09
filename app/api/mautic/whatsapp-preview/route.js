import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

function authorized(request) {
  const secret = process.env.MAUTIC_BRIDGE_API_KEY;
  const supplied = request.headers.get("x-bridge-api-key");
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sender = url.searchParams.get("sender") || "whatsapp_teste";
  if (!/^[a-z0-9_-]{1,40}$/.test(sender)) {
    return NextResponse.json({ ok: false, error: "invalid_sender" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    dry_run: true,
    campaign: "TESTE | Fluxo WhatsApp Baileys",
    status: "blueprint_only",
    sender,
    source: { type: "segment", segment: "Contatos de teste - WhatsApp" },
    nodes: [
      { id: "entry", type: "segment_entry", label: "Entrada no segmento" },
      { id: "wait", type: "delay", after: "entry", seconds: 60 },
      { id: "send", type: "whatsapp", after: "wait", provider: "baileys", sender, mode: "disabled", message: "Olá, {{nome}}! Esta é uma mensagem de teste da nossa automação." },
      { id: "result", type: "event_log", after: "send", statuses: ["queued", "sent", "failed"] }
    ],
    safeguards: {
      sending_enabled: false,
      contact_import: false,
      webhook_execution: false,
      baileys_server_modified: false,
      mautic_campaign_created: false,
      requires_explicit_approval_before_real_sending: true
    },
    note: "Blueprint only. No Mautic campaign, WhatsApp message, or contact changed."
  }, { headers: { "Cache-Control": "no-store" } });
}
