import assert from "node:assert/strict";
import test from "node:test";

import { serializeBuildingRows } from "../lib/buildingsGeoJsonCore.ts";

test("serializeBuildingRows emits a GeoJSON feature collection", () => {
  const json = serializeBuildingRows([
    {
      pand_id: "pand-a",
      geometry: '{"type":"Polygon","coordinates":[[[6.1,53.1],[6.2,53.1],[6.2,53.2],[6.1,53.1]]]}',
      entry_count: 3,
      address_count: 2,
    },
  ]);

  assert.equal(
    json,
    '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[6.1,53.1],[6.2,53.1],[6.2,53.2],[6.1,53.1]]]},"properties":{"pand_id":"pand-a","entry_count":3,"address_count":2}}]}',
  );
});

test("serializeBuildingRows throws a useful error for invalid geometry JSON", () => {
  assert.throws(
    () =>
      serializeBuildingRows([
        {
          pand_id: "pand-a",
          geometry: "not-json",
          entry_count: 1,
          address_count: 1,
        },
      ]),
    /Invalid building geometry JSON for pand-a/,
  );
});
