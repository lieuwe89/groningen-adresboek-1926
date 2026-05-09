import { promises as fs } from "fs";
import path from "path";
import { loadOverrides, mergeOverrides } from "./overrides";
import { flattenPageEntries } from "./flatten";
import { getDb } from "./db";
import { getJsonDir } from "./projectPaths.js";

export type Bbox = [number, number, number, number];

export interface Entry {
  name?: string | null;
  initials?: string | null;
  name_prefix?: string | null;
  name_prefix_expanded?: string | null;
  occupation?: string | null;
  occupation_expanded?: string | null;
  address_street?: string | null;
  address_street_expanded?: string | null;
  address_number?: string | null;
  phone?: string | null;
  cross_references?: string[];
  word_ids?: string[];
  name_word_ids?: string[];
  address_word_ids?: string[];
  notes?: string | null;
  entry_bbox?: Bbox | null;
  name_bbox?: Bbox | null;
  address_bbox?: Bbox | null;
  searchable_text?: string;
  address_full?: string;
  _alignment_confidence?: number;
  _alto_tag_id?: string;
  flags?: { verified?: boolean; needs_review?: boolean; bbox_unreliable?: boolean };
  lat?: number | null;
  lng?: number | null;
  pand_id?: string | null;
}

export interface PageData {
  page_number: number;
  section: string;
  header?: { text: string; bbox?: Bbox };
  footer?: { text: string; bbox?: Bbox };
  entries: Entry[];
}

const JSON_DIR = getJsonDir();

export async function loadPage(stem: string): Promise<PageData | null> {
  const file = path.join(JSON_DIR, `${stem}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PageData;
    const base: PageData = { ...parsed, entries: flattenPageEntries(parsed) };
    const overrides = await loadOverrides(stem);
    const data = mergeOverrides(stem, base, overrides);

    // Merge DB info (geocoding, building links)
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT e.stable_id, e.lat, e.lng, e.pand_id,
                  e.entry_bbox, e.name_bbox, e.address_bbox,
                  e.flag_verified, e.flag_needs_review
           FROM entries e JOIN pages p ON e.page_id = p.id
           WHERE p.stem = ?`
        )
        .all(stem) as Array<{
          stable_id: string;
          lat: number | null;
          lng: number | null;
          pand_id: string | null;
          entry_bbox: string | null;
          name_bbox: string | null;
          address_bbox: string | null;
          flag_verified: number;
          flag_needs_review: number;
        }>;
      const dbMap = new Map(rows.map((r) => [r.stable_id, r]));

      data.entries = data.entries.map((e, i) => {
        const sid = `${stem}:${i}`;
        const dbInfo = dbMap.get(sid);
        if (dbInfo) {
          const parseBbox = (s: string | null): Bbox | null => {
            if (!s) return null;
            try {
              return JSON.parse(s);
            } catch {
              return null;
            }
          };
          return {
            ...e,
            lat: dbInfo.lat,
            lng: dbInfo.lng,
            pand_id: dbInfo.pand_id,
            entry_bbox: e.entry_bbox ?? parseBbox(dbInfo.entry_bbox),
            name_bbox: e.name_bbox ?? parseBbox(dbInfo.name_bbox),
            address_bbox: e.address_bbox ?? parseBbox(dbInfo.address_bbox),
            flags: {
              ...e.flags,
              verified: dbInfo.flag_verified === 1,
              needs_review: dbInfo.flag_needs_review === 1,
            },
          };
        }
        return e;
      });
    } catch (err) {
      console.warn(`Failed to merge DB info for stem ${stem}:`, err);
    }

    return data;
  } catch {
    return null;
  }
}

export async function loadPageRaw(stem: string): Promise<PageData | null> {
  const file = path.join(JSON_DIR, `${stem}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PageData;
    return { ...parsed, entries: flattenPageEntries(parsed) };
  } catch {
    return null;
  }
}

export async function listStems(): Promise<string[]> {
  try {
    const files = await fs.readdir(JSON_DIR);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();
  } catch {
    return [];
  }
}

export function neighborStems(stem: string, all: string[]): { prev?: string; next?: string } {
  const i = all.indexOf(stem);
  if (i < 0) return {};
  return {
    prev: i > 0 ? all[i - 1] : undefined,
    next: i < all.length - 1 ? all[i + 1] : undefined,
  };
}
