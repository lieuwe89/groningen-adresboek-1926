import { createHash } from "crypto";
import fs from "fs";

import { getDb } from "./db";
import {
  serializeBuildingRows,
  type BuildingRow,
} from "./buildingsGeoJsonCore";

type CachedPayload = {
  cacheKey: string;
  json: string;
  etag: string;
};

let cachedPayload: CachedPayload | null = null;

function currentCacheKey(dbPath: string): string {
  try {
    const stat = fs.statSync(dbPath);
    // inode + mtime catch both file-replace and in-place writes.
    return `${stat.ino}:${stat.mtimeMs}`;
  } catch {
    return dbPath;
  }
}

export function getBuildingsGeoJsonPayload(): { json: string; etag: string } {
  const db = getDb();
  const cacheKey = currentCacheKey(db.name);
  if (cachedPayload?.cacheKey === cacheKey) return cachedPayload;

  const rows = db
    .prepare(
      `SELECT pand_id, geometry, entry_count, address_count, bouwjaar
       FROM buildings`,
    )
    .all() as BuildingRow[];
  const json = serializeBuildingRows(rows);
  const etag = `"${createHash("sha1").update(json).digest("base64url")}"`;
  cachedPayload = { cacheKey, json, etag };
  return cachedPayload;
}

export function clearBuildingsGeoJsonCacheForTests(): void {
  cachedPayload = null;
}
