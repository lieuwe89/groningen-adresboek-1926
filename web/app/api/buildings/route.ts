import { NextResponse } from "next/server";
import { listBuildings } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const features = listBuildings();
  const isDev = process.env.NODE_ENV === "development";
  return NextResponse.json(
    { type: "FeatureCollection" as const, features },
    {
      headers: {
        "Cache-Control": isDev
          ? "no-store"
          : "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
