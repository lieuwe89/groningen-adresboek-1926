import { promises as fs } from "fs";
import path from "path";
import { loadOverrides, mergeOverrides } from "./overrides";
import { flattenPageEntries } from "./flatten";

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
}

export interface PageData {
  page_number: number;
  section: string;
  header?: { text: string; bbox?: Bbox };
  footer?: { text: string; bbox?: Bbox };
  entries: Entry[];
}

const JSON_DIR = path.resolve(process.cwd(), "..", "output", "json");

export async function loadPage(stem: string): Promise<PageData | null> {
  const file = path.join(JSON_DIR, `${stem}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PageData;
    const base: PageData = { ...parsed, entries: flattenPageEntries(parsed) };
    const overrides = await loadOverrides(stem);
    return mergeOverrides(stem, base, overrides);
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
