import fs from "fs";

import { getDb } from "./db";
import {
  serializeBuildingRows,
  type BuildingRow,
} from "./buildingsGeoJsonCore";

type CachedPayload = {
  cacheKey: string;
  json: string;
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

export function getBuildingsGeoJsonPayload(): string {
  const db = getDb();
  const cacheKey = currentCacheKey(db.name);
  if (cachedPayload?.cacheKey === cacheKey) return cachedPayload.json;

  const rows = db
    .prepare(
      `SELECT pand_id, geometry, entry_count, address_count
       FROM buildings`,
    )
    .all() as BuildingRow[];
  const json = serializeBuildingRows(rows);
  cachedPayload = { cacheKey, json };
  return json;
}

export function clearBuildingsGeoJsonCacheForTests(): void {
  cachedPayload = null;
}
