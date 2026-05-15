import { promises as fs } from "fs";
import path from "path";
import { loadOverrides } from "./overrides";
import { getJsonDir } from "./projectPaths.js";
import { getDb } from "./db";
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

export interface BagStats {
  total: number;
  bag_linked: number;
  street_no_number: number;
  street_number_no_bag: number;
  no_street: number;
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
  bag: BagStats;
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

  const results = await Promise.all(
    files.map(async (f) => {
      const stem = f.replace(/\.json$/, "");
      let page: PageData;
      try {
        page = JSON.parse(await fs.readFile(path.join(JSON_DIR, f), "utf8")) as PageData;
      } catch {
        return null;
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
        if ((ov.fields && Object.keys(ov.fields).length > 0) || ov.bbox) {
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
      return ps;
    })
  );

  for (const ps of results) {
    if (!ps) continue;
    byPage.push(ps);

    overall.pages++;
    overall.total += ps.total;
    overall.verified += ps.verified;
    overall.needs_review += ps.needs_review;
    overall.bbox_unreliable += ps.bbox_unreliable;
    overall.edited += ps.edited;
    overall.unreviewed += ps.unreviewed;

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
    sec.total += ps.total;
    sec.verified += ps.verified;
    sec.needs_review += ps.needs_review;
    sec.bbox_unreliable += ps.bbox_unreliable;
    sec.edited += ps.edited;
    sec.unreviewed += ps.unreviewed;
    sectionAcc.set(ps.section, sec);
  }

  let bag: BagStats = { total: 0, bag_linked: 0, street_no_number: 0, street_number_no_bag: 0, no_street: 0 };
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN pand_id IS NOT NULL THEN 1 ELSE 0 END) AS bag_linked,
        SUM(CASE WHEN pand_id IS NULL AND address_street IS NOT NULL AND trim(address_street) != ''
                      AND (address_number IS NULL OR trim(address_number) = '') THEN 1 ELSE 0 END) AS street_no_number,
        SUM(CASE WHEN pand_id IS NULL AND address_street IS NOT NULL AND trim(address_street) != ''
                      AND address_number IS NOT NULL AND trim(address_number) != '' THEN 1 ELSE 0 END) AS street_number_no_bag,
        SUM(CASE WHEN pand_id IS NULL AND (address_street IS NULL OR trim(address_street) = '') THEN 1 ELSE 0 END) AS no_street
      FROM entries
    `).get() as BagStats;
    bag = row;
  } catch {
    // DB unavailable — leave zeroes
  }

  return {
    overall,
    bag,
    bySection: [...sectionAcc.values()].sort((a, b) => b.total - a.total),
    byPage,
    generatedAt: new Date().toISOString(),
  };
}
