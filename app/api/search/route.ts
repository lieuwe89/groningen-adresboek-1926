import { NextResponse, type NextRequest } from "next/server";
import { search } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ total: 0, results: [], error: "missing q" }, { status: 400 });
  }
  const rawLimit = Number.parseInt(searchParams.get("limit") || `${DEFAULT_LIMIT}`, 10);
  const rawOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const fuzzy = searchParams.get("fuzzy") === "1";

  try {
    const out = search(q, limit, offset, fuzzy);
    return NextResponse.json({ ...out, q, limit, offset, fuzzy });
  } catch (e) {
    console.error(`[Search API] Search failed for query "${q}":`, e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
