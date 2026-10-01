import { NextResponse } from "next/server";
import { getValidAccessToken } from "../../../../lib/token-store";

export async function GET() {
  const baseUrl = process.env.MAUTIC_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) return NextResponse.json({ok:false,error:"missing_base_url"},{status:500});
  try {
    const token = await getValidAccessToken();
    const paths = [
      "/api/contacts?limit=1&minimal=true",
      "/api/contacts/list/fields",
      "/api/segments?limit=1",
      "/api/campaigns?limit=1"
    ];
    const results = [];
    for (const path of paths) {
      const r = await fetch(baseUrl + path, {headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"});
      const body = await r.text();
      results.push({path,status:r.status,ok:r.ok,body:body.slice(0,500)});
    }
    return NextResponse.json({ok:true,results});
  } catch (e) {
    return NextResponse.json({ok:false,error:e.message},{status:500});
  }
}
