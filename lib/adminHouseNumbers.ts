import type { Database as DB } from "better-sqlite3";

export interface HouseNumberCandidate {
  stable_id: string;
  name: string | null;
  address_street: string | null;
  address_number: string | null;
  address_full: string | null;
  entry_bbox: string;
  page_number: number | null;
}

export function listHouseNumberCandidates(db: DB, minDigits: number = 2): HouseNumberCandidate[] {
  return db.prepare(`
    SELECT e.stable_id, e.name, e.address_street, e.address_number, e.address_full, e.entry_bbox, p.page_number
    FROM entries e
    JOIN pages p ON e.page_id = p.id
    WHERE e.pand_id IS NULL
      AND COALESCE(e.flag_verified, 0) = 0
      AND length(e.address_number) > ?
      AND e.address_number GLOB '*[0-9]*'
      AND e.address_number NOT GLOB '*[^0-9]*'
      AND e.entry_bbox IS NOT NULL
      AND e.address_street IS NOT NULL AND trim(e.address_street) != ''
    ORDER BY e.address_street, e.address_number
    LIMIT 25
  `).all(minDigits) as HouseNumberCandidate[];
}

export function houseNumberCorrectionPayload(newNumber: string) {
  return {
    fields: { address_number: newNumber },
    flags: { verified: true, needs_review: false },
  };
}

export function listMissingNumberCandidates(db: DB): HouseNumberCandidate[] {
  return db.prepare(`
    SELECT e.stable_id, e.name, e.address_street, e.address_number, e.address_full, e.entry_bbox, p.page_number
    FROM entries e
    JOIN pages p ON e.page_id = p.id
    WHERE e.pand_id IS NULL
      AND COALESCE(e.flag_verified, 0) = 0
      AND e.address_street IS NOT NULL AND trim(e.address_street) != ''
      AND (e.address_number IS NULL OR trim(e.address_number) = '')
      AND e.entry_bbox IS NOT NULL
      AND e.name IS NOT NULL AND trim(e.name) != ''
      AND EXISTS (
        SELECT 1 FROM entries v
        WHERE v.pand_id IS NOT NULL
          AND v.address_street = e.address_street
      )
    ORDER BY e.address_street, e.name
    LIMIT 50
  `).all() as HouseNumberCandidate[];
}
