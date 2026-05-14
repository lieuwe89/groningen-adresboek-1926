#!/usr/bin/env node
/**
 * Snapshot all edited / verified entries before a pipeline re-run.
 *
 * Use BEFORE running the LLM pipeline on flagged pages. Writes a JSON file
 * with the current stable_id → fingerprint mapping plus a verbatim copy of
 * the current row fields. After rebuild_db, you can:
 *   1. Inspect this file to see what was at risk.
 *   2. Use the `fingerprint` field to re-attach overrides whose stable_id
 *      shifted (apply-overrides.mjs already does this fallback).
 *   3. As a last resort, hand-restore field values from the snapshot.
 *
 * Usage:
 *   node scripts/snapshot-edits-pre-rerun.mjs [output.json]
 *
 * Env:
 *   DB_PATH  path to adresboek.sqlite (default ./data/adresboek.sqlite)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH =
  process.env.DB_PATH ?? path.resolve(process.cwd(), "data", "adresboek.sqlite");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT =
  process.argv[2] ??
  path.resolve(
    process.env.HOME ?? ".",
    "Documents/claude-output",
    `edits-snapshot-${stamp}.json`
  );

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const rows = db
  .prepare(
    `
    SELECT
      e.id, e.stable_id, e.fingerprint, e.edited_at,
      e.flag_verified, e.flag_needs_review, e.flag_bbox_unreliable,
      p.stem AS page_stem, p.page_number,
      e.entry_index, e.name, e.initials, e.name_prefix, e.name_prefix_expanded,
      e.entity_type, e.occupation, e.occupation_expanded,
      e.address_street, e.address_street_expanded, e.address_number,
      e.address_full, e.notes, e.entry_bbox
    FROM entries e
    JOIN pages p ON p.id = e.page_id
    WHERE e.edited_at IS NOT NULL
       OR e.flag_verified = 1
       OR e.flag_needs_review = 1
       OR e.flag_bbox_unreliable = 1
    ORDER BY p.stem, e.entry_index
  `
  )
  .all();

const snapshot = {
  schema: "edits-snapshot/v1",
  source_db: DB_PATH,
  taken_at: new Date().toISOString(),
  row_count: rows.length,
  rows,
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2));
console.log(`Snapshot wrote ${rows.length} edited/flagged rows to ${OUT}`);
db.close();
