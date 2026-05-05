import { NextResponse, type NextRequest } from "next/server";
import { loadPageRaw, type Bbox } from "@/lib/data";
import {
  loadOverrides,
  writeOverrides,
  entryFingerprint,
  entryId,
  type EntryOverride,
} from "@/lib/overrides";

const ALLOWED_FIELDS = new Set([
  "name",
  "initials",
  "name_prefix",
  "name_prefix_expanded",
  "occupation",
  "occupation_expanded",
  "address_street",
  "address_street_expanded",
  "address_number",
  "phone",
  "address_full",
  "notes",
]);

function sanitizeFields(input: unknown): EntryOverride["fields"] | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (v === null || typeof v === "string") out[k] = v;
  }
  return out as EntryOverride["fields"];
}

const ALLOWED_FLAGS = new Set(["verified", "needs_review", "bbox_unreliable"]);

function sanitizeFlags(input: unknown): Record<string, boolean> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_FLAGS.has(k)) continue;
    if (typeof v !== "boolean") continue;
    out[k] = v;
  }
  return out;
}

function sanitizeBbox(input: unknown): Bbox | null {
  if (!Array.isArray(input) || input.length !== 4) return null;
  const nums = input.map((n) => (typeof n === "number" ? Math.round(n) : NaN));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [x1, y1, x2, y2] = nums;
  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2] as Bbox;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/page/[stem]/entry/[idx]">
) {
  const { stem, idx } = await ctx.params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "invalid index" }, { status: 400 });
  }

  const page = await loadPageRaw(stem);
  if (!page) return NextResponse.json({ error: "page not found" }, { status: 404 });
  const baseEntry = page.entries[index];
  if (!baseEntry) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const fields = sanitizeFields(body.fields);
  const flagsIn = sanitizeFlags(body.flags);
  const bboxIn = "bbox" in body ? sanitizeBbox(body.bbox) : undefined;
  if ("bbox" in body && bboxIn === null) {
    return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
  }

  const overrides = await loadOverrides(stem);
  const id = entryId(stem, index);
  const prev = overrides[id] || {};

  const next: EntryOverride = {
    ...prev,
    fields: { ...(prev.fields || {}), ...(fields || {}) },
    flags: { ...(prev.flags || {}), ...(flagsIn || {}) },
    fingerprint: entryFingerprint(baseEntry),
    edited_at: new Date().toISOString(),
  };
  if (bboxIn) {
    next.bbox = { type: "rect", value: bboxIn, source: "manual" };
  }

  overrides[id] = next;
  await writeOverrides(stem, overrides);
  
  // Also update the database so search hits match immediately
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    db.prepare(`
      UPDATE entries 
      SET entry_bbox = ?, edited_at = ?
      WHERE stable_id = ?
    `).run(
      bboxIn ? JSON.stringify(bboxIn) : null,
      next.edited_at,
      id
    );
  } catch (err) {
    console.warn("Failed to update database with new bbox:", err);
  }

  return NextResponse.json({ ok: true, override: next });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/admin/page/[stem]/entry/[idx]">
) {
  const { stem, idx } = await ctx.params;
  const index = Number.parseInt(idx, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "invalid index" }, { status: 400 });
  }
  const overrides = await loadOverrides(stem);
  delete overrides[entryId(stem, index)];
  await writeOverrides(stem, overrides);
  return NextResponse.json({ ok: true });
}
