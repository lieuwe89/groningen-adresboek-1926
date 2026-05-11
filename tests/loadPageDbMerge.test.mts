import assert from "node:assert/strict";
import test from "node:test";

import { mergePageEntryDbInfo } from "../lib/pageDbMerge.ts";

test("page DB merge overlays normalized SQLite entry fields onto stale page JSON", () => {
  const merged = mergePageEntryDbInfo(
    {
      name: "Noordhof",
      initials: "A.",
      occupation: "Loodg.kn.",
      occupation_expanded: "Loodgietersknecht",
      address_street: "N. Ebbingestr.",
      address_street_expanded: "Noordzijde Ebbingestraat",
      address_number: "49a",
      address_full: "Noordzijde Ebbingestraat 49a",
      word_ids: ["w1"],
      entry_bbox: [1, 2, 3, 4],
    },
    {
      name: "Noordhof",
      initials: "A.",
      name_prefix: null,
      name_prefix_expanded: null,
      entity_type: null,
      role: null,
      parent_organization: null,
      description: null,
      occupation: "Loodg.kn.",
      occupation_expanded: "Loodgietersknecht",
      address_street: "Nieuwe Ebbingestraat",
      address_street_expanded: "Nieuwe Ebbingestraat",
      address_number: "49a",
      phone: null,
      notes: null,
      address_full: "Nieuwe Ebbingestraat 49a",
      searchable_text: "Noordhof A. Loodg.kn. Loodgietersknecht Nieuwe Ebbingestraat 49a",
      lat: 53.22,
      lng: 6.56,
      pand_id: "pand-1",
      entry_bbox: "[10,20,30,40]",
      name_bbox: "[11,21,31,41]",
      address_bbox: "[12,22,32,42]",
      flag_verified: 1,
      flag_needs_review: 0,
    }
  );

  assert.equal(merged.address_street, "Nieuwe Ebbingestraat");
  assert.equal(merged.address_street_expanded, "Nieuwe Ebbingestraat");
  assert.equal(merged.address_full, "Nieuwe Ebbingestraat 49a");
  assert.equal(merged.pand_id, "pand-1");
  assert.deepEqual(merged.word_ids, ["w1"]);
  assert.deepEqual(merged.entry_bbox, [1, 2, 3, 4]);
  assert.deepEqual(merged.name_bbox, [11, 21, 31, 41]);
  assert.equal(merged.flags?.verified, true);
});
