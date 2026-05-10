// Client-shared types for /api/search.
// Mirrors SearchRow in lib/db.ts (server-only via better-sqlite3 import).

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

export type PersonHit = {
  cluster_id: string;
  canonical_name: string | null;
  canonical_occupation: string | null;
  canonical_address: string | null;
  mentions: SearchMention[];
};

export type SearchResponse = {
  total: number;
  results: PersonHit[];
  q: string;
  limit: number;
  offset: number;
};
