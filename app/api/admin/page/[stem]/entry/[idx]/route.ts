import { NextResponse, type NextRequest } from "next/server";
import { syncEntryDerivedData } from "@/lib/adminDbSync";
import { loadAdminBaseEntry, type Bbox } from "@/lib/adminEntryLookup";
import { getWritableDb } from "@/lib/db";
import {
  loadOverrides,
  updateOverride,
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

const DB_FIELD_COLUMNS: Partial<Record<keyof NonNullable<EntryOverride["fields"]>, string>> = {
  name: "name",
  initials: "initials",
  name_prefix: "name_prefix",
  name_prefix_expanded: "name_prefix_expanded",
  occupation: "occupation",
  occupation_expanded: "occupation_expanded",
  address_street: "address_street",
  address_street_expanded: "address_street_expanded",
  address_number: "address_number",
  phone: "phone",
  address_full: "address_full",
  notes: "notes",
};

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

  const baseEntry = await loadAdminBaseEntry(stem, index);
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

  // Detect whether address fields changed — if so, re-geocode via PDOK
  const ADDRESS_FIELDS = new Set(["address_street", "address_street_expanded", "address_number"]);
  const addressChanged = fields
    ? Object.keys(fields).some((k) => ADDRESS_FIELDS.has(k))
    : false;

  let geocodeInfo: Record<string, unknown> | null = null;

  // Build the merged entry so we can compute address_full and update the DB
  const merged = { ...baseEntry, ...(prev.fields || {}), ...(fields || {}) };
  const street = merged.address_street_expanded || merged.address_street || "";
  const num = merged.address_number || "";
  const addressFull = [street, num].filter(Boolean).join(" ");

  try {
    const db = getWritableDb();
    const updates: string[] = ["edited_at = ?"];
    const params: unknown[] = [next.edited_at];

    if (bboxIn) {
      updates.push("entry_bbox = ?");
      params.push(JSON.stringify(bboxIn));
    }
    if (flagsIn) {
      if ("verified" in flagsIn) {
        updates.push("flag_verified = ?");
        params.push(flagsIn.verified ? 1 : 0);
      }
      if ("needs_review" in flagsIn) {
        updates.push("flag_needs_review = ?");
        params.push(flagsIn.needs_review ? 1 : 0);
      }
      if ("bbox_unreliable" in flagsIn) {
        updates.push("flag_bbox_unreliable = ?");
        params.push(flagsIn.bbox_unreliable ? 1 : 0);
      }
    }
    if (fields) {
      const fieldsToPersist: Record<string, string | null> = { ...fields };
      if (addressChanged) fieldsToPersist.address_full = addressFull;

      for (const [k, v] of Object.entries(fieldsToPersist)) {
        const column = DB_FIELD_COLUMNS[k as keyof NonNullable<EntryOverride["fields"]>];
        if (column) {
          updates.push(`${column} = ?`);
          params.push(v);
        }
      }
    }

    params.push(id);
    db.prepare(`UPDATE entries SET ${updates.join(", ")} WHERE stable_id = ?`).run(
      ...params
    );
    if (!addressChanged) {
      syncEntryDerivedData(db, id);
    }
  } catch (err) {
    console.error(`[Admin API] Database update failed for ${id}:`, err);
    return NextResponse.json(
      { error: `Database update failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  if (addressChanged) {
    const db = getWritableDb();
    try {
      if (addressFull.trim()) {
        const { pdokGeocode } = await import("@/lib/geocode");
        const geo = await pdokGeocode(addressFull);
        geocodeInfo = geo as unknown as Record<string, unknown>;

        if (geo.status === "ok" && geo.lat != null && geo.lng != null) {
          db.prepare(`
            UPDATE entries
            SET lat = ?, lng = ?,
                geocode_score = ?, geocode_type = ?,
                geocode_matched = ?, geocode_flags = ?,
                address_full = ?,
                pand_id = NULL,
                edited_at = ?
            WHERE stable_id = ? AND edited_at = ?
          `).run(
            geo.lat, geo.lng,
            geo.score ?? null, geo.type ?? null,
            geo.matched ?? null, geo.flags ? JSON.stringify(geo.flags) : null,
            addressFull,
            next.edited_at,
            id,
            next.edited_at
          );
        } else {
          // Geocode failed — clear old location data so stale pin disappears
          db.prepare(`
            UPDATE entries
            SET lat = NULL, lng = NULL,
                geocode_score = NULL, geocode_type = NULL,
                geocode_matched = NULL, geocode_flags = ?,
                address_full = ?,
                pand_id = NULL,
                edited_at = ?
            WHERE stable_id = ? AND edited_at = ?
          `).run(
            JSON.stringify(geo.flags || ["not_found"]),
            addressFull,
            next.edited_at,
            id,
            next.edited_at
          );
        }
      } else {
        // Address was cleared — clear old location data so stale pin disappears
        db.prepare(`
          UPDATE entries
          SET lat = NULL, lng = NULL,
              geocode_score = NULL, geocode_type = NULL,
              geocode_matched = NULL, geocode_flags = ?,
              address_full = ?,
              pand_id = NULL,
              edited_at = ?
          WHERE stable_id = ? AND edited_at = ?
        `).run(
          JSON.stringify(["address_empty"]),
          addressFull,
          next.edited_at,
          id,
          next.edited_at
        );
      }
    } catch (err) {
      console.warn("Re-geocode failed:", err);
      db.prepare(`
        UPDATE entries
        SET lat = NULL, lng = NULL,
            geocode_score = NULL, geocode_type = NULL,
            geocode_matched = NULL, geocode_flags = ?,
            pand_id = NULL,
            edited_at = ?
        WHERE stable_id = ? AND edited_at = ?
      `).run(JSON.stringify(["geocode_error"]), next.edited_at, id, next.edited_at);
    }
    syncEntryDerivedData(db, id);
    const { linkToNearestBuilding } = await import("@/lib/adminDbSync");
    linkToNearestBuilding(db, id);
  }

  let savedOverride: EntryOverride;
  try {
    savedOverride = await updateOverride(stem, id, (latest) => {
      const updated: EntryOverride = {
        ...latest,
        fields: { ...(latest?.fields || {}), ...(fields || {}) },
        flags: { ...(latest?.flags || {}), ...(flagsIn || {}) },
        fingerprint: entryFingerprint(baseEntry),
        edited_at: next.edited_at,
      };
      if (bboxIn) {
        updated.bbox = { type: "rect", value: bboxIn, source: "manual" };
      } else if (latest?.bbox) {
        updated.bbox = latest.bbox;
      }
      return updated;
    });
  } catch (err) {
    console.error(`[Admin API] Override update failed for ${id}:`, err);
    return NextResponse.json(
      { error: `Failed to save override: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, override: savedOverride, geocode: geocodeInfo });
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
