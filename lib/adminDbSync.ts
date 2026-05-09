import type { Database as DB } from "better-sqlite3";

type EntryRow = {
  id: number;
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
  pand_id: string | null;
  person_id: number | null;
};

function compactJoin(parts: Array<string | null | undefined>): string | null {
  const value = parts.filter(Boolean).join(" ").trim();
  return value || null;
}

function longestValue(current: string | null, candidate: string | null | undefined): string | null {
  if (!candidate) return current;
  return !current || candidate.length > current.length ? candidate : current;
}

export function searchableTextForEntry(entry: Partial<EntryRow>): string {
  const parts = [
    entry.name,
    entry.initials,
    entry.name_prefix,
    entry.name_prefix_expanded,
    entry.occupation,
    entry.occupation_expanded,
    entry.address_street,
    entry.address_street_expanded,
    entry.address_number,
    entry.address_full,
  ];
  return parts.filter(Boolean).join(" ");
}

export function syncEntryDerivedData(db: DB, stableId: string): void {
  const edited = db.prepare(`
    SELECT id, name, initials, name_prefix, name_prefix_expanded,
           occupation, occupation_expanded, address_street, address_street_expanded,
           address_number, address_full, pand_id, person_id
    FROM entries
    WHERE stable_id = ?
  `).get(stableId) as EntryRow | undefined;

  if (!edited) return;

  // Consistency: if address_street changed but expanded wasn't updated, 
  // we should probably clear or update the expanded one to avoid stale search hits.
  if (edited.address_street && edited.address_street_expanded && 
      !edited.address_street_expanded.toLowerCase().includes(edited.address_street.toLowerCase())) {
    db.prepare("UPDATE entries SET address_street_expanded = NULL WHERE id = ?").run(edited.id);
    edited.address_street_expanded = null;
  }

  db.prepare("UPDATE entries SET searchable_text = ? WHERE id = ?").run(
    searchableTextForEntry(edited),
    edited.id
  );

  if (edited.person_id != null) {
    const rows = db.prepare(`
      SELECT id, name, initials, name_prefix, name_prefix_expanded,
             occupation, occupation_expanded, address_full, pand_id
      FROM entries
      WHERE person_id = ?
      ORDER BY id
    `).all(edited.person_id) as EntryRow[];

    let canonicalName: string | null = null;
    let canonicalOccupation: string | null = null;
    let canonicalAddress: string | null = null;
    let canonicalPandId: string | null = null;

    for (const row of rows) {
      canonicalName = longestValue(
        canonicalName,
        compactJoin([row.initials, row.name_prefix_expanded, row.name])
      );
      canonicalOccupation = longestValue(
        canonicalOccupation,
        row.occupation_expanded || row.occupation
      );
      canonicalAddress = longestValue(canonicalAddress, row.address_full);
      if (!canonicalPandId && row.pand_id) canonicalPandId = row.pand_id;
    }

    db.prepare(`
      UPDATE persons
      SET canonical_name = ?,
          canonical_occupation = ?,
          canonical_address = ?,
          canonical_pand_id = ?,
          entry_count = ?
      WHERE id = ?
    `).run(
      canonicalName,
      canonicalOccupation,
      canonicalAddress,
      canonicalPandId,
      rows.length,
      edited.person_id
    );
  }

  db.prepare("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')").run();
}

/**
 * Finds the nearest building in the 'buildings' table and links the entry to it.
 * Uses a simple squared distance on coordinates (good enough for local scale).
 */
export function linkToNearestBuilding(db: DB, stableId: string): void {
  const entry = db.prepare("SELECT id, lat, lng FROM entries WHERE stable_id = ?").get(stableId) as { id: number, lat: number | null, lng: number | null } | undefined;
  if (!entry || entry.lat == null || entry.lng == null) return;

  const nearest = db.prepare(`
    SELECT pand_id
    FROM buildings
    WHERE centroid_lat BETWEEN ? AND ?
      AND centroid_lng BETWEEN ? AND ?
    ORDER BY (centroid_lat - ?)*(centroid_lat - ?) + (centroid_lng - ?)*(centroid_lng - ?)
    LIMIT 1
  `).get(
    entry.lat - 0.001, entry.lat + 0.001,
    entry.lng - 0.001, entry.lng + 0.001,
    entry.lat, entry.lat, entry.lng, entry.lng
  ) as { pand_id: string } | undefined;

  if (nearest) {
    db.prepare("UPDATE entries SET pand_id = ? WHERE id = ?").run(nearest.pand_id, entry.id);
  }
}
