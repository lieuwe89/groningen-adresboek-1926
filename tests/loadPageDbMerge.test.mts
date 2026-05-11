import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      role TEXT,
      parent_organization TEXT,
      description TEXT,
      occupation TEXT,
      occupation_expanded TEXT,
      address_street TEXT,
      address_street_expanded TEXT,
      address_number TEXT,
      phone TEXT,
      notes TEXT,
      address_full TEXT,
      searchable_text TEXT,
      entry_bbox TEXT,
      name_bbox TEXT,
      address_bbox TEXT,
      lat REAL,
      lng REAL,
      flag_verified INTEGER DEFAULT 0,
      flag_needs_review INTEGER DEFAULT 0,
      pand_id TEXT
    );
  `);
  db.prepare("INSERT INTO pages (id, stem, page_number, section) VALUES (1, 'page', 417, 'name_register')").run();
  db.prepare(`
    INSERT INTO entries (
      id, page_id, entry_index, stable_id, name, initials, occupation, occupation_expanded,
      address_street, address_street_expanded, address_number, address_full, searchable_text,
      entry_bbox, flag_verified, flag_needs_review, pand_id
    )
    VALUES (
      1, 1, 0, 'page:0', 'Noordhof', 'A.', 'Loodg.kn.', 'Loodgietersknecht',
      'Nieuwe Ebbingestraat', 'Nieuwe Ebbingestraat', '49a', 'Nieuwe Ebbingestraat 49a',
      'Noordhof A. Loodg.kn. Loodgietersknecht Nieuwe Ebbingestraat 49a',
      '[10,20,30,40]', 1, 0, 'pand-1'
    )
  `).run();
  db.close();
}

test("loadPage overlays normalized SQLite entry fields onto stale page JSON", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grn-load-page-"));
  const jsonDir = path.join(dir, "json");
  const overridesDir = path.join(dir, "overrides");
  const dbFile = path.join(dir, "adresboek.sqlite");
  createDb(dbFile);
  mkdirSync(jsonDir, { recursive: true });
  writeFileSync(
    path.join(jsonDir, "page.json"),
    JSON.stringify({
      page_number: 417,
      section: "name_register",
      entries: [
        {
          name: "Noordhof",
          initials: "A.",
          occupation: "Loodg.kn.",
          occupation_expanded: "Loodgietersknecht",
          address_street: "N. Ebbingestr.",
          address_street_expanded: "Noordzijde Ebbingestraat",
          address_number: "49a",
          address_full: "Noordzijde Ebbingestraat 49a",
          word_ids: ["w1"],
          entry_bbox: [1, 2, 3, 4],
        },
      ],
    }),
    "utf8"
  );

  const previousDbPath = process.env.DB_PATH;
  const previousJsonDir = process.env.JSON_DIR;
  const previousOverridesDir = process.env.OVERRIDES_DIR;
  process.env.DB_PATH = dbFile;
  process.env.JSON_DIR = jsonDir;
  process.env.OVERRIDES_DIR = overridesDir;

  try {
    const moduleUrl = `${pathToFileURL(
      path.join(process.cwd(), "lib", "data.ts")
    ).href}?test=${Date.now()}`;
    const { loadPage } = await import(moduleUrl);
    const page = await loadPage("page");

    assert.equal(page?.entries[0].address_street, "Nieuwe Ebbingestraat");
    assert.equal(page?.entries[0].address_street_expanded, "Nieuwe Ebbingestraat");
    assert.equal(page?.entries[0].address_full, "Nieuwe Ebbingestraat 49a");
    assert.equal(page?.entries[0].pand_id, "pand-1");
    assert.deepEqual(page?.entries[0].word_ids, ["w1"]);
    assert.deepEqual(page?.entries[0].entry_bbox, [1, 2, 3, 4]);
    assert.equal(page?.entries[0].flags?.verified, true);
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
    if (previousOverridesDir === undefined) {
      delete process.env.OVERRIDES_DIR;
    } else {
      process.env.OVERRIDES_DIR = previousOverridesDir;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
