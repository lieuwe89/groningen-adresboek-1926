import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import type { Bbox, Entry, PageData } from "./data";

export type EntryId = string; // `<stem>:<index>`

export interface EntryOverride {
  fields?: Partial<Pick<
    Entry,
    | "name"
    | "initials"
    | "name_prefix"
    | "name_prefix_expanded"
    | "occupation"
    | "occupation_expanded"
    | "address_street"
    | "address_street_expanded"
    | "address_number"
    | "phone"
    | "address_full"
    | "notes"
  >>;
  bbox?: { type: "rect"; value: Bbox; source: "manual" };
  flags?: { verified?: boolean; needs_review?: boolean; bbox_unreliable?: boolean };
  fingerprint?: string;
  edited_at?: string;
  edit_history?: { ts: string; diff: Record<string, unknown> }[];
}

export interface OverridesFile {
  [entryId: EntryId]: EntryOverride;
}

const OVERRIDES_DIR = path.resolve(process.cwd(), "..", "output", "overrides");

export async function loadOverrides(stem: string): Promise<OverridesFile> {
  const file = path.join(OVERRIDES_DIR, `${stem}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as OverridesFile;
  } catch {
    return {};
  }
}

export async function writeOverrides(stem: string, data: OverridesFile): Promise<void> {
  await fs.mkdir(OVERRIDES_DIR, { recursive: true });
  const file = path.join(OVERRIDES_DIR, `${stem}.json`);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export function entryFingerprint(e: Entry): string {
  const norm = (s: string | null | undefined) =>
    (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const sig = [
    norm(e.name),
    norm(e.initials),
    norm(e.name_prefix),
    norm(e.address_street_expanded || e.address_street),
    norm(e.address_number),
    norm(e.occupation_expanded || e.occupation),
  ].join("|");
  return "sha1:" + createHash("sha1").update(sig).digest("hex");
}

export function entryId(stem: string, index: number): EntryId {
  return `${stem}:${index}`;
}

export function applyOverride(entry: Entry, ov?: EntryOverride): Entry {
  if (!ov) return entry;
  const merged: Entry = { ...entry, ...(ov.fields || {}) };
  if (ov.bbox?.value) {
    merged.entry_bbox = ov.bbox.value;
  }
  if (ov.flags) {
    merged.flags = { ...ov.flags };
  }
  // Recompute address_full from new fields if address fields changed and no explicit override
  if (
    ov.fields &&
    !("address_full" in ov.fields) &&
    ("address_street" in ov.fields ||
      "address_street_expanded" in ov.fields ||
      "address_number" in ov.fields)
  ) {
    const street = merged.address_street_expanded || merged.address_street || "";
    const num = merged.address_number || "";
    merged.address_full = [street, num].filter(Boolean).join(" ").trim();
  }
  // Refresh searchable_text basics
  merged.searchable_text = [
    merged.name,
    merged.initials,
    merged.name_prefix,
    merged.name_prefix_expanded,
    merged.occupation,
    merged.occupation_expanded,
    merged.address_street,
    merged.address_street_expanded,
    merged.address_number,
  ]
    .filter(Boolean)
    .join(" ");
  return merged;
}

export function mergeOverrides(stem: string, page: PageData, overrides: OverridesFile): PageData {
  const entries = page.entries.map((e, i) => applyOverride(e, overrides[entryId(stem, i)]));
  return { ...page, entries };
}
