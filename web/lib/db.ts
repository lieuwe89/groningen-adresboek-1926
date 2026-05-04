import Database, { type Database as DB } from "better-sqlite3";
import path from "path";

import fs from "fs";

let _db: DB | null = null;
let _dbInode: number | null = null;

export function getDb(): DB {
  const dbPath = path.resolve(process.cwd(), "data", "adresboek.sqlite");
  // Reopen if the file's inode has changed (e.g. build_db.py recreated it).
  let currentInode: number | null = null;
  try {
    currentInode = fs.statSync(dbPath).ino;
  } catch {
    // ignore — fileMustExist below will throw
  }
  if (_db && currentInode === _dbInode) return _db;
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
  _db = new Database(dbPath, { fileMustExist: true });
  _db.pragma("journal_mode = WAL");
  _db.pragma("query_only = ON");
  _dbInode = currentInode;
  return _db;
}

export type SearchRow = {
  id: number;
  stable_id: string;
  stem: string;
  page_number: number | null;
  section: string;
  name: string | null;
  initials: string | null;
  occupation: string | null;
  occupation_expanded: string | null;
  address_full: string | null;
  lat: number | null;
  lng: number | null;
  geocode_type: string | null;
  geocode_flags: string | null;
  flag_verified: number;
  flag_needs_review: number;
  flag_bbox_unreliable: number;
  entry_bbox: string | null;
  name_bbox: string | null;
  address_bbox: string | null;
};

export type SearchResult = {
  total: number;
  results: SearchRow[];
};

const SEARCH_SQL = `
  SELECT
    e.id, e.stable_id, p.stem, p.page_number, p.section,
    e.name, e.initials, e.occupation, e.occupation_expanded,
    e.address_full, e.lat, e.lng, e.geocode_type, e.geocode_flags,
    e.flag_verified, e.flag_needs_review, e.flag_bbox_unreliable,
    e.entry_bbox, e.name_bbox, e.address_bbox
  FROM entries_fts f
  JOIN entries e ON e.id = f.rowid
  JOIN pages p ON e.page_id = p.id
  WHERE entries_fts MATCH ?
  ORDER BY rank
  LIMIT ? OFFSET ?
`;

const COUNT_SQL = `
  SELECT COUNT(*) AS n
  FROM entries_fts
  WHERE entries_fts MATCH ?
`;

// Sanitize the user query for FTS5 syntax. Strip anything that could be an
// FTS operator (",), then split into tokens and AND them with prefix matches.
// Empty result returns null.
export function buildFtsQuery(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[\"\,\(\):*+\-]/g, " ")
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => `${t}*`);
  if (!tokens.length) return null;
  return tokens.join(" AND ");
}

export type SectionInfo = {
  section: string;
  label: string;
  first_stem: string;
  first_page_number: number | null;
  count: number;
};

const SECTION_LABELS: Record<string, string> = {
  other: "Voorwerk",
  institutional: "Instellingen",
  advertisement: "Advertenties",
  name_register: "Naamregister",
  street_register: "Stratenregister",
  occupation_register: "Beroepenregister",
};

const SECTIONS_SQL = `
  SELECT
    section,
    MIN(stem) AS first_stem,
    MIN(page_number) AS first_page_number,
    COUNT(*) AS count
  FROM pages
  WHERE section IS NOT NULL AND section <> ''
  GROUP BY section
  ORDER BY MIN(stem)
`;

export function listSections(): SectionInfo[] {
  const db = getDb();
  const rows = db.prepare(SECTIONS_SQL).all() as Array<{
    section: string;
    first_stem: string;
    first_page_number: number | null;
    count: number;
  }>;
  return rows.map((r) => ({
    ...r,
    label: SECTION_LABELS[r.section] || r.section,
  }));
}

// ── Buildings (BAG pand polygons with linked 1926 entries) ───────────────

export type BuildingFeature = {
  type: "Feature";
  geometry: unknown;
  properties: {
    pand_id: string;
    entry_count: number;
    address_count: number;
  };
};

export function listBuildings(): BuildingFeature[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT pand_id, geometry, entry_count, address_count
     FROM buildings`
  ).all() as Array<{
    pand_id: string;
    geometry: string;
    entry_count: number;
    address_count: number;
  }>;
  return rows.map((r) => ({
    type: "Feature" as const,
    geometry: JSON.parse(r.geometry),
    properties: {
      pand_id: r.pand_id,
      entry_count: r.entry_count,
      address_count: r.address_count,
    },
  }));
}

export type BuildingEntry = {
  stable_id: string;
  stem: string;
  page_number: number | null;
  name: string | null;
  initials: string | null;
  occupation: string | null;
  address_full: string | null;
};

export type BuildingDetail = {
  pand_id: string;
  centroid: { lat: number; lng: number } | null;
  bbox: [number, number, number, number] | null;
  addresses: Array<{
    address_full: string;
    entries: BuildingEntry[];
  }>;
};

export function getBuilding(pand_id: string): BuildingDetail | null {
  const db = getDb();
  const b = db.prepare(
    `SELECT pand_id, centroid_lat, centroid_lng,
            bbox_west, bbox_south, bbox_east, bbox_north
     FROM buildings WHERE pand_id = ?`
  ).get(pand_id) as
    | {
        pand_id: string;
        centroid_lat: number | null;
        centroid_lng: number | null;
        bbox_west: number | null;
        bbox_south: number | null;
        bbox_east: number | null;
        bbox_north: number | null;
      }
    | undefined;
  if (!b) return null;
  const rows = db.prepare(
    `SELECT e.stable_id, p.stem, p.page_number,
            e.name, e.initials,
            COALESCE(e.occupation_expanded, e.occupation) AS occupation,
            e.address_full
     FROM entries e JOIN pages p ON e.page_id = p.id
     WHERE e.pand_id = ?
     ORDER BY e.address_full, e.name`
  ).all(pand_id) as BuildingEntry[];
  const byAddress = new Map<string, BuildingEntry[]>();
  for (const e of rows) {
    const k = e.address_full ?? "";
    if (!byAddress.has(k)) byAddress.set(k, []);
    byAddress.get(k)!.push(e);
  }
  return {
    pand_id: b.pand_id,
    centroid:
      b.centroid_lat != null && b.centroid_lng != null
        ? { lat: b.centroid_lat, lng: b.centroid_lng }
        : null,
    bbox:
      b.bbox_west != null
        ? [b.bbox_west!, b.bbox_south!, b.bbox_east!, b.bbox_north!]
        : null,
    addresses: Array.from(byAddress.entries()).map(([address_full, entries]) => ({
      address_full,
      entries,
    })),
  };
}

export function search(query: string, limit = 50, offset = 0): SearchResult {
  const fts = buildFtsQuery(query);
  if (!fts) return { total: 0, results: [] };
  const db = getDb();
  const total = (db.prepare(COUNT_SQL).get(fts) as { n: number }).n;
  const results = db.prepare(SEARCH_SQL).all(fts, limit, offset) as SearchRow[];
  return { total, results };
}
