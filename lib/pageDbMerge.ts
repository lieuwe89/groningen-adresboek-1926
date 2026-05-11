import type { Bbox, Entry } from "./data";

export type PageEntryDbInfo = {
  name: string | null;
  initials: string | null;
  name_prefix: string | null;
  name_prefix_expanded: string | null;
  entity_type: string | null;
  role: string | null;
  parent_organization: string | null;
  description: string | null;
  occupation: string | null;
  occupation_expanded: string | null;
  address_street: string | null;
  address_street_expanded: string | null;
  address_number: string | null;
  phone: string | null;
  notes: string | null;
  address_full: string | null;
  searchable_text: string | null;
  lat: number | null;
  lng: number | null;
  pand_id: string | null;
  entry_bbox: string | null;
  name_bbox: string | null;
  address_bbox: string | null;
  flag_verified: number;
  flag_needs_review: number;
};

function parseBbox(value: string | null): Bbox | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mergePageEntryDbInfo(entry: Entry, dbInfo: PageEntryDbInfo): Entry {
  return {
    ...entry,
    name: dbInfo.name,
    initials: dbInfo.initials,
    name_prefix: dbInfo.name_prefix,
    name_prefix_expanded: dbInfo.name_prefix_expanded,
    entity_type: dbInfo.entity_type,
    role: dbInfo.role,
    parent_organization: dbInfo.parent_organization,
    description: dbInfo.description,
    occupation: dbInfo.occupation,
    occupation_expanded: dbInfo.occupation_expanded,
    address_street: dbInfo.address_street,
    address_street_expanded: dbInfo.address_street_expanded,
    address_number: dbInfo.address_number,
    phone: dbInfo.phone,
    notes: dbInfo.notes,
    address_full: dbInfo.address_full ?? undefined,
    searchable_text: dbInfo.searchable_text ?? undefined,
    lat: dbInfo.lat,
    lng: dbInfo.lng,
    pand_id: dbInfo.pand_id,
    entry_bbox: entry.entry_bbox ?? parseBbox(dbInfo.entry_bbox),
    name_bbox: entry.name_bbox ?? parseBbox(dbInfo.name_bbox),
    address_bbox: entry.address_bbox ?? parseBbox(dbInfo.address_bbox),
    flags: {
      ...entry.flags,
      verified: dbInfo.flag_verified === 1,
      needs_review: dbInfo.flag_needs_review === 1,
    },
  };
}
