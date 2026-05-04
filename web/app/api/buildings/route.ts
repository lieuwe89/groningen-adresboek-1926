import { NextResponse } from "next/server";
import { listBuildings } from "@/lib/db";

export const runtime = "nodejs";
// Building polygons rarely change between DB rebuilds — cache aggressively.
export const revalidate = 3600;

export async function GET() {
  const features = listBuildings();
  return NextResponse.json(
    { type: "FeatureCollection" as const, features },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
