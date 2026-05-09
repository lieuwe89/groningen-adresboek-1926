import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE pages (
      id INTEGER PRIMARY KEY,
      stem TEXT NOT NULL,
      page_number INTEGER
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pages(id),
      stable_id TEXT UNIQUE NOT NULL,
      name TEXT,
      address_street TEXT,
      address_number TEXT,
      address_full TEXT,
      entry_bbox TEXT,
      pand_id TEXT,
      flag_verified INTEGER DEFAULT 0
    );
  `);
  db.prepare("INSERT INTO pages (id, stem, page_number) VALUES (1, 'page', 1)").run();
  db.prepare(`
    INSERT INTO entries (
      id, page_id, stable_id, name, address_street, address_number,
      address_full, entry_bbox, pand_id, flag_verified
    )
    VALUES
      (1, 1, 'page:0', 'Open', 'Astraat', '521', 'Astraat 521', '[1,2,3,4]', NULL, 0),
      (2, 1, 'page:1', 'Saved', 'Astraat', '522', 'Astraat 522', '[1,2,3,4]', NULL, 1)
  `).run();
  return db;
}

test("listHouseNumberCandidates excludes already verified corrections", async () => {
  const db = createDb();
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), "lib", "adminHouseNumbers.ts")
  ).href;
  const { listHouseNumberCandidates } = await import(moduleUrl);

  const candidates = listHouseNumberCandidates(db);

  assert.deepEqual(
    (candidates as Array<{ stable_id: string }>).map((candidate) => candidate.stable_id),
    ["page:0"]
  );
});

test("houseNumberCorrectionPayload marks a saved correction as verified", async () => {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), "lib", "adminHouseNumbers.ts")
  ).href;
  const { houseNumberCorrectionPayload } = await import(moduleUrl);

  assert.deepEqual(houseNumberCorrectionPayload("522"), {
    fields: { address_number: "522" },
    flags: { verified: true, needs_review: false },
  });
});
