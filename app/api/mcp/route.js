import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getValidAccessToken } from "../../../lib/token-store";

const baseUrl = () => {
  const value = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  if (!value) throw new Error("Mautic is not configured");
  return value;
};
const resources = {
  contacts: "/api/contacts",
  segments: "/api/segments",
  campaigns: "/api/campaigns",
  emails: "/api/emails",
  forms: "/api/forms"
};
const handler = createMcpHandler((server) => {
  server.tool("mautic_list", "Read-only paginated listing of Mautic contacts, segments, campaigns, emails or forms.", {
    resource: z.enum(["contacts", "segments", "campaigns", "emails", "forms"]),
    search: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(25).default(10),
    page: z.number().int().min(1).default(1)
  }, async ({ resource, search, limit, page }) => {
    const target = new URL(baseUrl() + resources[resource]);
    target.searchParams.set("limit", String(limit));
    target.searchParams.set("start", String((page - 1) * limit));
    if (search) target.searchParams.set("search", search);
    try {
      const token = await getValidAccessToken();
      const response = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) return { isError: true, content: [{ type: "text", text: `Mautic returned HTTP ${response.status}` }] };
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify({ resource, page, limit, data }) }] };
    } catch (error) {
      console.error("MCP list failed", error);
      return { isError: true, content: [{ type: "text", text: "Unable to query Mautic" }] };
    }
  });
  server.tool("mautic_prepare_contact", "Validate and preview a proposed new contact. Does not save or send anything.", {
    email: z.string().email().max(254),
    firstname: z.string().max(100).optional(),
    lastname: z.string().max(100).optional(),
    mobile: z.string().max(40).optional()
  }, async ({ email, firstname, lastname, mobile }) => ({
    content: [{ type: "text", text: JSON.stringify({
      valid: true, dry_run: true, saved: false,
      action: "create_contact",
      contact: { email, firstname: firstname || "", lastname: lastname || "", mobile: mobile || "" },
      next_step: "Ask the user to confirm before executing a separate authenticated write operation."
    }) }]
  }));
  server.tool("mautic_prepare_segment", "Validate and preview a proposed segment. Does not create or change a segment.", {
    name: z.string().trim().min(1).max(150),
    description: z.string().max(500).optional()
  }, async ({ name, description }) => ({
    content: [{ type: "text", text: JSON.stringify({
      valid: true, dry_run: true, saved: false,
      action: "create_segment",
      segment: { name, description: description || "" },
      next_step: "Ask the user to confirm before executing a separate authenticated write operation."
    }) }]
  }));
  server.tool("mautic_connection", "Check whether Mautic OAuth and the API connection are operational. Does not return contact data.", {}, async () => {
    try {
      const token = await getValidAccessToken();
      const response = await fetch(baseUrl() + "/api/segments?limit=1", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store"
      });
      return { content: [{ type: "text", text: JSON.stringify({ connected: response.ok, status: response.status }) }] };
    } catch (error) {
      console.error("MCP connection check failed", error);
      return { isError: true, content: [{ type: "text", text: "Connection check failed" }] };
    }
  });
}, { capabilities: { tools: {} } }, { basePath: "/api", maxDuration: 60 });

const verifyToken = async (_request, bearerToken) => {
  const expected = process.env.MAUTIC_BRIDGE_API_KEY;
  if (!expected || !bearerToken) return undefined;
  const a = Buffer.from(expected);
  const b = Buffer.from(bearerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return { token: bearerToken, scopes: ["mautic:read"], clientId: "mautic-bridge" };
};
const secured = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["mautic:read"],
  resourceMetadataPath: "/.well-known/oauth-protected-resource"
});
export { secured as GET, secured as POST };
