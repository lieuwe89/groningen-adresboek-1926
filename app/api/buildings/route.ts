import { getBuildingsGeoJsonPayload } from "@/lib/buildingsGeoJson";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const isDev = process.env.NODE_ENV === "development";
  return new Response(getBuildingsGeoJsonPayload(), {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Cache-Control": isDev
        ? "no-store"
        : "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
