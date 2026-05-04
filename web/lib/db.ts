import Database, { type Database as DB } from "better-sqlite3";
import path from "path";

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const dbPath = path.resolve(process.cwd(), "data", "adresboek.sqlite");
  _db = new Database(dbPath, { fileMustExist: true });
  _db.pragma("journal_mode = WAL");
  _db.pragma("query_only = ON");
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

export function search(query: string, limit = 50, offset = 0): SearchResult {
  const fts = buildFtsQuery(query);
  if (!fts) return { total: 0, results: [] };
  const db = getDb();
  const total = (db.prepare(COUNT_SQL).get(fts) as { n: number }).n;
  const results = db.prepare(SEARCH_SQL).all(fts, limit, offset) as SearchRow[];
  return { total, results };
}
