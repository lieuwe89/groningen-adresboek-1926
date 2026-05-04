// Client-shared types for /api/search.
// Mirrors SearchRow in lib/db.ts (server-only via better-sqlite3 import).

export type SearchHit = {
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

export type SearchResponse = {
  total: number;
  results: SearchHit[];
  q: string;
  limit: number;
  offset: number;
};
