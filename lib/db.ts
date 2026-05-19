import Database, { type Database as DB } from "better-sqlite3";
import path from "path";

import fs from "fs";

let _db: DB | null = null;
let _dbInode: number | null = null;

export function getDb(): DB {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "adresboek.sqlite");
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

let _dbW: DB | null = null;
let _dbWInode: number | null = null;

/** Writable DB handle for admin operations (no query_only). */
export function getWritableDb(): DB {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "adresboek.sqlite");
  let currentInode: number | null = null;
  try {
    currentInode = fs.statSync(dbPath).ino;
  } catch {
    // ignore
  }
  if (_dbW && currentInode === _dbWInode) return _dbW;
  if (_dbW) {
    try { _dbW.close(); } catch { /* ignore */ }
    _dbW = null;
  }
  _dbW = new Database(dbPath, { fileMustExist: true });
  _dbW.pragma("journal_mode = WAL");
  _dbWInode = currentInode;
  return _dbW;
}

export type SearchMention = {
  id: number;
  stable_id: string;
  stem: string;
  page_number: number | null;
  section: string;
  name: string | null;
  initials: string | null;
  entity_type: string | null;
  role: string | null;
  parent_organization: string | null;
  description: string | null;
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

export type SearchRow = {
  cluster_id: string;
  canonical_name: string | null;
  canonical_occupation: string | null;
  canonical_address: string | null;
  mentions: SearchMention[];
};

export type SearchResult = {
  total: number;
  results: SearchRow[];
};

const SEARCH_SQL = `
  SELECT
    COALESCE(CAST(e.person_id AS TEXT), 'u-' || e.id) as cluster_id,
    MIN(f.rank) as min_rank,
    json_group_array(json_object(
      'id', e.id, 'stable_id', e.stable_id, 'stem', p.stem, 'page_number', p.page_number, 'section', p.section,
      'name', e.name, 'initials', e.initials,
      'entity_type', e.entity_type, 'role', e.role, 'parent_organization', e.parent_organization, 'description', e.description,
      'occupation', e.occupation, 'occupation_expanded', e.occupation_expanded,
      'address_full', e.address_full, 'lat', e.lat, 'lng', e.lng, 'geocode_type', e.geocode_type, 'geocode_flags', e.geocode_flags,
      'flag_verified', e.flag_verified, 'flag_needs_review', e.flag_needs_review, 'flag_bbox_unreliable', e.flag_bbox_unreliable,
      'entry_bbox', e.entry_bbox, 'name_bbox', e.name_bbox, 'address_bbox', e.address_bbox
    )) as mentions_json,
    pr.canonical_name, pr.canonical_occupation, pr.canonical_address
  FROM entries_fts f
  JOIN entries e ON e.id = f.rowid
  JOIN pages p ON e.page_id = p.id
  LEFT JOIN persons pr ON e.person_id = pr.id
  WHERE entries_fts MATCH ?
  GROUP BY cluster_id
  ORDER BY min_rank
  LIMIT ? OFFSET ?
`;

const COUNT_SQL = `
  SELECT COUNT(DISTINCT COALESCE(e.person_id, 'u-' || e.id)) AS n
  FROM entries_fts f
  JOIN entries e ON e.id = f.rowid
  WHERE entries_fts MATCH ?
`;

// Sanitize the user query for FTS5 syntax. Whitelist letters (incl. diacritics),
// digits, spaces and apostrophes; everything else becomes a space. Each token
// then gets a trailing * appended for prefix matching.
export function buildFtsQuery(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => {
      const base = t.replace(/\*/g, "");
      return base.length >= 2 ? `${base}*` : null;
    })
    .filter(Boolean) as string[];
  if (!tokens.length) return null;
  return tokens.join(" AND ");
}

// Build a broad OR query for fuzzy candidate retrieval. Uses a short prefix
// (first 3 chars) per token to cast a wide net before Levenshtein re-ranking.
function buildFuzzyFtsQuery(tokens: string[]): string {
  return tokens
    .map((t) => `${t.length >= 4 ? t.slice(0, 3) : t}*`)
    .join(" OR ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = [...curr];
  }
  return prev[n];
}

// Per query-token: minimum Levenshtein distance to any name token.
// Returns sum across all query tokens (lower = better match).
function scoreFuzzy(queryTokens: string[], canonicalName: string | null, mentions: SearchMention[]): number {
  const name = (canonicalName || mentions[0]?.name || "").toLowerCase();
  const nameTokens = name.split(/\s+/).filter((t) => t.length > 0);
  if (nameTokens.length === 0) return Infinity;
  return queryTokens.reduce((sum, qt) => {
    return sum + Math.min(...nameTokens.map((nt) => levenshtein(qt, nt)));
  }, 0);
}

// Max total edit distance threshold: 1 per short token, 2 per longer token.
function maxTotalDist(tokens: string[]): number {
  return tokens.reduce((sum, t) => sum + (t.length <= 4 ? 1 : 2), 0);
}

const FUZZY_CANDIDATE_LIMIT = 500;

export type SectionInfo = {
  section: string;
  label: string;
  first_stem: string;
  first_scan_number: number | null;
  first_page_number: number | null;
  count: number;
};

const SECTION_LABELS: Record<string, string> = {
  other: "Index & Inleiding",
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
    CAST(SUBSTR(MIN(stem), -4) AS INTEGER) AS first_scan_number,
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
    first_scan_number: number | null;
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

export type BuildingMention = {
  stable_id: string;
  stem: string;
  page_number: number | null;
  section: string;
  name: string | null;
  initials: string | null;
  entity_type: string | null;
  role: string | null;
  parent_organization: string | null;
  description: string | null;
  occupation: string | null;
  address_full: string | null;
};

export type BuildingPerson = {
  cluster_id: string;
  canonical_name: string | null;
  canonical_occupation: string | null;
  canonical_address: string | null;
  mentions: BuildingMention[];
};

export type BuildingDetail = {
  pand_id: string;
  centroid: { lat: number; lng: number } | null;
  bbox: [number, number, number, number] | null;
  persons: BuildingPerson[];
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
  
  const rawRows = db.prepare(
    `SELECT
      COALESCE(CAST(e.person_id AS TEXT), 'u-' || e.id) as cluster_id,
      json_group_array(json_object(
        'stable_id', e.stable_id, 'stem', p.stem, 'page_number', p.page_number, 'section', p.section,
        'name', e.name, 'initials', e.initials,
        'entity_type', e.entity_type, 'role', e.role, 'parent_organization', e.parent_organization, 'description', e.description,
        'occupation', COALESCE(e.occupation_expanded, e.occupation),
        'address_full', e.address_full
      )) as mentions_json,
      pr.canonical_name, pr.canonical_occupation, pr.canonical_address
     FROM entries e 
     JOIN pages p ON e.page_id = p.id
     LEFT JOIN persons pr ON e.person_id = pr.id
     WHERE e.pand_id = ?
     GROUP BY cluster_id
     ORDER BY pr.canonical_name, e.name`
  ).all(pand_id) as Array<{
    cluster_id: string;
    mentions_json: string;
    canonical_name: string | null;
    canonical_occupation: string | null;
    canonical_address: string | null;
  }>;
  
  const persons: BuildingPerson[] = rawRows.map(r => ({
    cluster_id: r.cluster_id,
    canonical_name: r.canonical_name,
    canonical_occupation: r.canonical_occupation,
    canonical_address: r.canonical_address,
    mentions: JSON.parse(r.mentions_json),
  }));

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
    persons,
  };
}

export function search(query: string, limit = 50, offset = 0, fuzzy = false): SearchResult {
  if (fuzzy) return searchFuzzy(query, limit, offset);
  const fts = buildFtsQuery(query);
  if (!fts) return { total: 0, results: [] };
  const db = getDb();
  const total = (db.prepare(COUNT_SQL).get(fts) as { n: number }).n;
  const rawResults = db.prepare(SEARCH_SQL).all(fts, limit, offset) as any[];
  const results: SearchRow[] = rawResults.map((r) => ({
    cluster_id: r.cluster_id,
    canonical_name: r.canonical_name,
    canonical_occupation: r.canonical_occupation,
    canonical_address: r.canonical_address,
    mentions: JSON.parse(r.mentions_json),
  }));
  return { total, results };
}

function searchFuzzy(query: string, limit: number, offset: number): SearchResult {
  const rawTokens = query
    .toLowerCase()
    .replace(/[\"\,\(\):+\-./\\;!?]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/\*/g, ""))
    .filter((t) => t.length >= 2);
  if (!rawTokens.length) return { total: 0, results: [] };

  const ftsQuery = buildFuzzyFtsQuery(rawTokens);
  const db = getDb();
  const rawCandidates = db.prepare(SEARCH_SQL).all(ftsQuery, FUZZY_CANDIDATE_LIMIT, 0) as any[];
  if (!rawCandidates.length) return { total: 0, results: [] };

  const maxDist = maxTotalDist(rawTokens);
  const scored = rawCandidates
    .map((r) => {
      const mentions: SearchMention[] = JSON.parse(r.mentions_json);
      return { r, mentions, dist: scoreFuzzy(rawTokens, r.canonical_name, mentions) };
    })
    .filter((s) => s.dist <= maxDist)
    .sort((a, b) => a.dist - b.dist || a.r.min_rank - b.r.min_rank);

  const total = scored.length;
  return {
    total,
    results: scored.slice(offset, offset + limit).map(({ r, mentions }) => ({
      cluster_id: r.cluster_id,
      canonical_name: r.canonical_name,
      canonical_occupation: r.canonical_occupation,
      canonical_address: r.canonical_address,
      mentions,
    })),
  };
}
