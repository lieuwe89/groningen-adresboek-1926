import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { syncEntryDerivedData } from "../lib/adminDbSync.ts";

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT,
      canonical_occupation TEXT,
      canonical_address TEXT,
      canonical_pand_id TEXT,
      entry_count INTEGER DEFAULT 0
    );
    CREATE TABLE pages (
      id INTEGER PRIMARY KEY,
      stem TEXT NOT NULL,
      page_number INTEGER,
      section TEXT
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pages(id),
      entry_index INTEGER NOT NULL,
      stable_id TEXT UNIQUE NOT NULL,
      name TEXT,
      initials TEXT,
      name_prefix TEXT,
      name_prefix_expanded TEXT,
      entity_type TEXT,
      occupation TEXT,
      occupation_expanded TEXT,
      address_street TEXT,
      address_street_expanded TEXT,
      address_number TEXT,
      address_full TEXT,
      searchable_text TEXT,
      pand_id TEXT,
      person_id INTEGER REFERENCES persons(id),
      edited_at TEXT
    );
    CREATE VIRTUAL TABLE entries_fts USING fts5(
      name, initials, name_prefix_expanded,
      entity_type,
      occupation, occupation_expanded,
      address_street, address_street_expanded, address_number, address_full,
      searchable_text,
      content='entries',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
  db.prepare("INSERT INTO pages (id, stem, section) VALUES (1, 'page', 'name_register')").run();
  db.prepare(`
    INSERT INTO persons (id, canonical_name, canonical_occupation, canonical_address, canonical_pand_id, entry_count)
    VALUES (1, 'J. Smoth', 'smid', 'A straat 1', 'pand-a', 2)
  `).run();
  db.prepare(`
    INSERT INTO entries (
      id, page_id, entry_index, stable_id, name, initials, name_prefix_expanded,
      entity_type, occupation_expanded, address_full, searchable_text, pand_id, person_id
    )
    VALUES
      (1, 1, 0, 'page:0', 'Smoth', 'J.', NULL, NULL, 'smid', 'A straat 1', 'Smoth J. smid A straat 1', 'pand-a', 1),
      (2, 1, 1, 'page:1', 'Smoth', 'J.', NULL, NULL, 'smid', 'A straat 1', 'Smoth J. smid A straat 1', 'pand-a', 1)
  `).run();
  db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
  return db;
}

test("syncEntryDerivedData refreshes person canonicals and FTS after an admin edit", () => {
  const db = createDb();
  db.prepare(`
    UPDATE entries
    SET name = 'Smith',
        searchable_text = 'Smith J. smid A straat 1',
        edited_at = '2026-05-09T10:00:00.000Z'
    WHERE stable_id = 'page:0'
  `).run();

  syncEntryDerivedData(db, "page:0");

  const person = db.prepare("SELECT canonical_name FROM persons WHERE id = 1").get() as {
    canonical_name: string;
  };
  assert.equal(person.canonical_name, "J. Smith");

  const staleHits = db.prepare("SELECT COUNT(*) AS n FROM entries_fts WHERE entries_fts MATCH 'Smoth'").get() as {
    n: number;
  };
  assert.equal(staleHits.n, 1);

  const correctedHits = db.prepare("SELECT COUNT(*) AS n FROM entries_fts WHERE entries_fts MATCH 'Smith'").get() as {
    n: number;
  };
  assert.equal(correctedHits.n, 1);
});

test("syncEntryDerivedData removes explicit organizations from person clusters", () => {
  const db = createDb();
  db.prepare(`
    UPDATE entries
    SET entity_type = 'organization',
        edited_at = '2026-05-09T10:00:00.000Z'
    WHERE stable_id = 'page:0'
  `).run();

  syncEntryDerivedData(db, "page:0");

  const entry = db.prepare("SELECT person_id FROM entries WHERE stable_id = 'page:0'").get() as {
    person_id: number | null;
  };
  assert.equal(entry.person_id, null);

  const person = db.prepare("SELECT entry_count, canonical_name FROM persons WHERE id = 1").get() as {
    entry_count: number;
    canonical_name: string;
  };
  assert.equal(person.entry_count, 1);
  assert.equal(person.canonical_name, "J. Smoth");
});
