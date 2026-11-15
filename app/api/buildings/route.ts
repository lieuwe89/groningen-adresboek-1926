import type { NextRequest } from "next/server";
import { getBuildingsGeoJsonPayload } from "@/lib/buildingsGeoJson";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { json, etag } = getBuildingsGeoJsonPayload();
  // The DB is rebuilt on the server without a release, and pand ids change with it. A browser that kept
  // the list for a day asked for parcels that no longer exist (404). Revalidate every load: a 304 is cheap.
  const headers = { "Cache-Control": "no-cache", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(json, {
    headers: { ...headers, "Content-Type": "application/geo+json; charset=utf-8" },
  });
}
