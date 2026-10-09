import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export async function GET(request) {
  const expected = process.env.MAUTIC_BRIDGE_API_KEY;
  const provided = request.headers.get("x-bridge-api-key");
  if (!expected || !provided) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a,b)) return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  const q = new URL(request.url).searchParams;
  const resource = q.get("resource");
  if (!["segments","contacts"].includes(resource)) return NextResponse.json({ok:false,error:"unsupported_resource"},{status:400});
  const payload = resource === "segments" ? {name:q.get("name"),description:q.get("description") || ""} : {email:q.get("email"),firstname:q.get("firstname") || "",lastname:q.get("lastname") || ""};
  if (resource === "segments" && !payload.name?.trim()) return NextResponse.json({ok:false,error:"name_required"},{status:400});
  if (resource === "contacts" && !payload.email?.includes("@")) return NextResponse.json({ok:false,error:"valid_email_required"},{status:400});
  return NextResponse.json({ok:true,dry_run:true,resource,action:"create",payload,message:"Preview only; no Mautic data changed."},{headers:{"Cache-Control":"no-store"}});
}
