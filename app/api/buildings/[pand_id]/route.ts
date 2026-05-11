import { NextResponse, type NextRequest } from "next/server";
import { getBuilding } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/buildings/[pand_id]">,
) {
  const { pand_id } = await ctx.params;
  const data = getBuilding(pand_id);
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
