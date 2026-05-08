// TS port of pipeline.json_export._collect_entries_for_index (Python).
// MUST stay in lockstep with the Python source — scripts/build_db.py
// imports the Python flattener and uses its iteration order to assign
// stable_id = `<stem>:<idx>`. If you change the order or rules on either
// side, change them on the other.

import type { Entry, PageData } from "./data";

type RawPage = PageData & {
  streets?: { street_name?: string; street_name_expanded?: string; entries?: Entry[] }[];
  occupations?: {
    occupation_name?: string;
    occupation_name_expanded?: string;
    entries?: Entry[];
  }[];
  entities?: Entry[];
  advertisements?: (Entry & { business_name?: string })[];
  addresses_found?: {
    context?: string;
    address_street?: string;
    address_street_expanded?: string;
    address_number?: string;
    address_word_ids?: string[];
  }[];
};

export function flattenPageEntries(page: RawPage): Entry[] {
  const section = page.section ?? "generic";
  const entries: Entry[] = [];

  if (section === "name_register") {
    for (const e of page.entries ?? []) entries.push(e);
  } else if (section === "street_register") {
    for (const street of page.streets ?? []) {
      for (const entry of street.entries ?? []) {
        if (!entry.address_street) {
          entry.address_street = street.street_name ?? null;
          entry.address_street_expanded = street.street_name_expanded ?? null;
        }
        entries.push(entry);
      }
    }
  } else if (section === "occupation_register") {
    for (const occ of page.occupations ?? []) {
      for (const entry of occ.entries ?? []) {
        if (!entry.occupation) {
          entry.occupation = occ.occupation_name ?? null;
          entry.occupation_expanded = occ.occupation_name_expanded ?? null;
        }
        entries.push(entry);
      }
    }
  } else if (section === "institutional") {
    for (const e of page.entities ?? []) entries.push(e);
  } else if (section === "advertisement") {
    for (const ad of page.advertisements ?? []) {
      const e = ad as Entry & { business_name?: string };
      if (!e.name) e.name = ad.business_name ?? null;
      entries.push(e);
    }
  } else if (section === "other") {
    for (const addr of page.addresses_found ?? []) {
      const street = addr.address_street_expanded ?? addr.address_street ?? "";
      const num = addr.address_number ?? "";
      const full = `${street} ${num}`.trim();
      entries.push({
        name: addr.context ?? "Unknown",
        address_street: addr.address_street ?? null,
        address_street_expanded: addr.address_street_expanded ?? null,
        address_number: addr.address_number ?? null,
        address_full: full || undefined,
        word_ids: addr.address_word_ids ?? [],
        address_word_ids: addr.address_word_ids ?? [],
      } as Entry);
    }
  }

  return entries;
}
