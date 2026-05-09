import type { Database as DB } from "better-sqlite3";
import type { Bbox, Entry } from "@/lib/data";

type AdminEntryRow = {
  name: string | null;
  initials: string | null;
  name_prefix: string | null;
  name_prefix_expanded: string | null;
  occupation: string | null;
  occupation_expanded: string | null;
  address_street: string | null;
  address_street_expanded: string | null;
  address_number: string | null;
  address_full: string | null;
  phone: string | null;
  notes: string | null;
  entry_bbox: string | null;
  name_bbox: string | null;
  address_bbox: string | null;
  flag_verified: number;
  flag_needs_review: number;
  flag_bbox_unreliable: number;
  lat: number | null;
  lng: number | null;
  pand_id: string | null;
};

function parseBbox(value: string | null): Bbox | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    if (parsed.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
    return parsed as Bbox;
  } catch {
    return null;
  }
}

export function loadAdminBaseEntryFromDb(db: DB, stem: string, index: number): Entry | null {
  const row = db.prepare(`
    SELECT e.name, e.initials, e.name_prefix, e.name_prefix_expanded,
           e.occupation, e.occupation_expanded,
           e.address_street, e.address_street_expanded,
           e.address_number, e.address_full, e.phone, e.notes,
           e.entry_bbox, e.name_bbox, e.address_bbox,
           e.flag_verified, e.flag_needs_review, e.flag_bbox_unreliable,
           e.lat, e.lng, e.pand_id
    FROM entries e
    JOIN pages p ON e.page_id = p.id
    WHERE p.stem = ? AND e.entry_index = ?
  `).get(stem, index) as AdminEntryRow | undefined;

  if (!row) return null;

  return {
    name: row.name,
    initials: row.initials,
    name_prefix: row.name_prefix,
    name_prefix_expanded: row.name_prefix_expanded,
    occupation: row.occupation,
    occupation_expanded: row.occupation_expanded,
    address_street: row.address_street,
    address_street_expanded: row.address_street_expanded,
    address_number: row.address_number,
    address_full: row.address_full || undefined,
    phone: row.phone,
    notes: row.notes,
    entry_bbox: parseBbox(row.entry_bbox),
    name_bbox: parseBbox(row.name_bbox),
    address_bbox: parseBbox(row.address_bbox),
    flags: {
      verified: row.flag_verified === 1,
      needs_review: row.flag_needs_review === 1,
      bbox_unreliable: row.flag_bbox_unreliable === 1,
    },
    lat: row.lat,
    lng: row.lng,
    pand_id: row.pand_id,
  };
}
