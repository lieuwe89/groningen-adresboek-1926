#!/usr/bin/env node
// Rebuild SQLite cache columns from data/overrides/*.json.
// Idempotent. Runs locally or inside the Fly machine.
// Usage:
//   node scripts/apply-overrides.mjs            # apply all override files
//   node scripts/apply-overrides.mjs <stem>     # apply one page
//   DB_PATH=... OVERRIDES_DIR=... node scripts/apply-overrides.mjs

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "adresboek.sqlite");
const OVERRIDES_DIR = process.env.OVERRIDES_DIR ?? path.resolve(process.cwd(), "data", "overrides");
const ONLY_STEM = process.argv[2] || null;

const FIELD_COLUMNS = {
  name: "name",
  initials: "initials",
  name_prefix: "name_prefix",
  name_prefix_expanded: "name_prefix_expanded",
  entity_type: "entity_type",
  occupation: "occupation",
  occupation_expanded: "occupation_expanded",
  address_street: "address_street",
  address_street_expanded: "address_street_expanded",
  address_number: "address_number",
  phone: "phone",
  address_full: "address_full",
  notes: "notes",
};

const FLAG_COLUMNS = {
  verified: "flag_verified",
  needs_review: "flag_needs_review",
  bbox_unreliable: "flag_bbox_unreliable",
};

function searchableText(row) {
  return [
    row.name, row.initials, row.name_prefix, row.name_prefix_expanded,
    row.entity_type, row.occupation, row.occupation_expanded,
    row.address_street, row.address_street_expanded, row.address_number,
    row.address_full,
  ].filter(Boolean).join(" ");
}

function applyEntry(db, id, ov, selectRow, updateText, lookupByFp) {
  const sets = [];
  const params = [];

  if (ov.fields) {
    for (const [k, v] of Object.entries(ov.fields)) {
      const col = FIELD_COLUMNS[k];
      if (!col) continue;
      sets.push(`${col} = ?`);
      params.push(v ?? null);
    }
  }
  if (ov.flags) {
    for (const [k, v] of Object.entries(ov.flags)) {
      const col = FLAG_COLUMNS[k];
      if (!col || typeof v !== "boolean") continue;
      sets.push(`${col} = ?`);
      params.push(v ? 1 : 0);
    }
  }
  if (ov.bbox?.value && Array.isArray(ov.bbox.value)) {
    sets.push("entry_bbox = ?");
    params.push(JSON.stringify(ov.bbox.value));
  }
  if (ov.fingerprint) {
    sets.push("fingerprint = ?");
    params.push(ov.fingerprint);
  }
  if (ov.edited_at) {
    sets.push("edited_at = ?");
    params.push(ov.edited_at);
  }

  if (sets.length === 0) return { applied: false, fallback: false };

  const stmt = db.prepare(
    `UPDATE entries SET ${sets.join(", ")} WHERE stable_id = ?`
  );
  let info = stmt.run(...params, id);
  let resolvedId = id;
  let fallback = false;

  if (info.changes === 0 && ov.fingerprint) {
    const stem = id.split(":")[0];
    const hit = lookupByFp.get(stem, ov.fingerprint);
    if (hit?.stable_id && hit.stable_id !== id) {
      resolvedId = hit.stable_id;
      info = stmt.run(...params, resolvedId);
      fallback = info.changes > 0;
    }
  }

  if (info.changes === 0) return { applied: false, fallback: false };

  const row = selectRow.get(resolvedId);
  if (row) updateText.run(searchableText(row), resolvedId);
  return { applied: true, fallback, oldId: id, newId: resolvedId };
}

function main() {
  const db = new Database(DB_PATH, { fileMustExist: true });
  db.pragma("journal_mode = WAL");

  const selectRow = db.prepare(`
    SELECT name, initials, name_prefix, name_prefix_expanded, entity_type,
           occupation, occupation_expanded, address_street, address_street_expanded,
           address_number, address_full
    FROM entries WHERE stable_id = ?
  `);
  const updateText = db.prepare(
    "UPDATE entries SET searchable_text = ? WHERE stable_id = ?"
  );
  const lookupByFp = db.prepare(`
    SELECT e.stable_id FROM entries e
    JOIN pages p ON p.id = e.page_id
    WHERE p.stem = ? AND e.fingerprint = ?
    LIMIT 1
  `);

  let files;
  try {
    files = readdirSync(OVERRIDES_DIR);
  } catch (err) {
    console.error(`Cannot read ${OVERRIDES_DIR}:`, err.message);
    process.exit(1);
  }
  files = files.filter((f) => f.endsWith(".json") && !f.startsWith("._"));
  if (ONLY_STEM) files = files.filter((f) => f === `${ONLY_STEM}.json`);

  let pages = 0, applied = 0, missing = 0, fellBack = 0;
  const fallbackLog = [];
  const tx = db.transaction(() => {
    for (const file of files) {
      const stem = file.slice(0, -5);
      const raw = JSON.parse(readFileSync(path.join(OVERRIDES_DIR, file), "utf8"));
      pages++;
      for (const [id, ov] of Object.entries(raw)) {
        if (!id.startsWith(`${stem}:`)) continue;
        const res = applyEntry(db, id, ov, selectRow, updateText, lookupByFp);
        if (res.applied) {
          applied++;
          if (res.fallback) {
            fellBack++;
            fallbackLog.push(`${res.oldId} -> ${res.newId}`);
          }
        } else {
          missing++;
        }
      }
    }
    db.prepare("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')").run();
  });

  tx();
  db.close();
  console.log(
    `apply-overrides: ${pages} page(s), ${applied} entries updated, ` +
    `${missing} not found, ${fellBack} resolved by fingerprint fallback.`
  );
  if (fallbackLog.length) {
    console.log("Fingerprint fallback remapped IDs (review and migrate override keys):");
    for (const line of fallbackLog) console.log(`  ${line}`);
  }
}

main();
