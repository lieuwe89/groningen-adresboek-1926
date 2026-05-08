import { NextResponse } from "next/server";
import { listSections } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sections: listSections() });
}
