import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

function createDb(file: string) {
  const db = new Database(file);
  db.exec(`
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
      phone TEXT,
      notes TEXT,
      entry_bbox TEXT,
      name_bbox TEXT,
      address_bbox TEXT,
      lat REAL,
      lng REAL,
      flag_verified INTEGER DEFAULT 0,
      flag_needs_review INTEGER DEFAULT 0,
      flag_bbox_unreliable INTEGER DEFAULT 0,
      pand_id TEXT
    );
  `);
  db.prepare("INSERT INTO pages (id, stem, section) VALUES (1, 'page-missing-json', 'name_register')").run();
  db.prepare(`
    INSERT INTO entries (
      id, page_id, entry_index, stable_id, name, initials, entity_type, occupation,
      address_street, address_street_expanded, address_number, address_full,
      notes, entry_bbox, flag_verified, flag_needs_review, flag_bbox_unreliable
    )
    VALUES (
      1, 1, 7, 'page-missing-json:7', 'Jansen', 'P.', 'person', 'bakker',
      'A straat', 'A-straat', '521', 'A-straat 521',
      'check scan', '[1,2,3,4]', 1, 0, 1
    )
  `).run();
  db.close();
}

test("loadAdminBaseEntry falls back to SQLite when page JSON is absent", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grn-admin-entry-"));
  const dbFile = path.join(dir, "adresboek.sqlite");
  createDb(dbFile);

  const previousDbPath = process.env.DB_PATH;
  const previousJsonDir = process.env.JSON_DIR;
  process.env.DB_PATH = dbFile;
  process.env.JSON_DIR = path.join(dir, "missing-json");

  try {
    const moduleUrl = pathToFileURL(
      path.join(process.cwd(), "lib", "adminEntryLookupCore.ts")
    ).href;
    const { loadAdminBaseEntryFromDb } = await import(moduleUrl);
    const db = new Database(dbFile, { readonly: true });
    const entry = loadAdminBaseEntryFromDb(db, "page-missing-json", 7);
    db.close();

    assert.equal(entry?.name, "Jansen");
    assert.equal(entry?.entity_type, "person");
    assert.equal(entry?.address_number, "521");
    assert.equal(entry?.address_full, "A-straat 521");
    assert.deepEqual(entry?.entry_bbox, [1, 2, 3, 4]);
    assert.equal(entry?.flags?.verified, true);
    assert.equal(entry?.flags?.bbox_unreliable, true);
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
    if (previousJsonDir === undefined) {
      delete process.env.JSON_DIR;
    } else {
      process.env.JSON_DIR = previousJsonDir;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
