import { promises as fs } from "fs";
import path from "path";
import { loadOverrides } from "./overrides";
import { getJsonDir } from "./projectPaths.js";
import type { PageData } from "./data";

const JSON_DIR = getJsonDir();

export interface PageStats {
  stem: string;
  page: number;
  section: string;
  total: number;
  verified: number;
  needs_review: number;
  bbox_unreliable: number;
  edited: number;
  unreviewed: number;
}

export interface SectionStats {
  section: string;
  pages: number;
  total: number;
  verified: number;
  needs_review: number;
  bbox_unreliable: number;
  edited: number;
  unreviewed: number;
}

export interface StatsReport {
  overall: {
    pages: number;
    total: number;
    verified: number;
    needs_review: number;
    bbox_unreliable: number;
    edited: number;
    unreviewed: number;
  };
  bySection: SectionStats[];
  byPage: PageStats[];
  generatedAt: string;
}

export async function computeStats(): Promise<StatsReport> {
  const files = (await fs.readdir(JSON_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const byPage: PageStats[] = [];
  const sectionAcc = new Map<string, SectionStats>();
  const overall = {
    pages: 0,
    total: 0,
    verified: 0,
    needs_review: 0,
    bbox_unreliable: 0,
    edited: 0,
    unreviewed: 0,
  };

  for (const f of files) {
    const stem = f.replace(/\.json$/, "");
    let page: PageData;
    try {
      page = JSON.parse(await fs.readFile(path.join(JSON_DIR, f), "utf8")) as PageData;
    } catch {
      continue;
    }
    const overrides = await loadOverrides(stem);
    const entries = page.entries || [];
    const total = entries.length;
    let verified = 0;
    let needs_review = 0;
    let bbox_unreliable = 0;
    let edited = 0;
    for (let i = 0; i < total; i++) {
      const ov = overrides[`${stem}:${i}`];
      if (!ov) continue;
      if (ov.flags?.verified) verified++;
      if (ov.flags?.needs_review) needs_review++;
      if (ov.flags?.bbox_unreliable) bbox_unreliable++;
      if (
        (ov.fields && Object.keys(ov.fields).length > 0) ||
        ov.bbox
      ) {
        edited++;
      }
    }
    const unreviewed = total - verified - needs_review;
    const ps: PageStats = {
      stem,
      page: page.page_number,
      section: page.section || "unknown",
      total,
      verified,
      needs_review,
      bbox_unreliable,
      edited,
      unreviewed,
    };
    byPage.push(ps);

    overall.pages++;
    overall.total += total;
    overall.verified += verified;
    overall.needs_review += needs_review;
    overall.bbox_unreliable += bbox_unreliable;
    overall.edited += edited;
    overall.unreviewed += unreviewed;

    const sec = sectionAcc.get(ps.section) ?? {
      section: ps.section,
      pages: 0,
      total: 0,
      verified: 0,
      needs_review: 0,
      bbox_unreliable: 0,
      edited: 0,
      unreviewed: 0,
    };
    sec.pages++;
    sec.total += total;
    sec.verified += verified;
    sec.needs_review += needs_review;
    sec.bbox_unreliable += bbox_unreliable;
    sec.edited += edited;
    sec.unreviewed += unreviewed;
    sectionAcc.set(ps.section, sec);
  }

  return {
    overall,
    bySection: [...sectionAcc.values()].sort((a, b) => b.total - a.total),
    byPage,
    generatedAt: new Date().toISOString(),
  };
}
