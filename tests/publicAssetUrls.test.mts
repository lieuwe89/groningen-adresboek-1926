import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAssetBaseUrl,
  resolvePublicAssetUrl,
} from "../lib/publicAssetUrls.ts";

test("normalizeAssetBaseUrl trims whitespace and trailing slashes", () => {
  assert.equal(
    normalizeAssetBaseUrl(" https://cdn.example.test/groningen-1926/// "),
    "https://cdn.example.test/groningen-1926",
  );
});

test("normalizeAssetBaseUrl ignores blank values", () => {
  assert.equal(normalizeAssetBaseUrl("   "), null);
  assert.equal(normalizeAssetBaseUrl(undefined), null);
});

test("resolvePublicAssetUrl prefixes the CDN base when configured", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "/maps/1536_6133.cog.tif",
      cdnBaseUrl: "https://cdn.example.test/groningen-1926/",
    }),
    "https://cdn.example.test/groningen-1926/maps/1536_6133.cog.tif",
  );
});

test("resolvePublicAssetUrl returns the normalized path when no CDN is configured", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "tiles/page.dzi",
    }),
    "/tiles/page.dzi",
  );
});

test("resolvePublicAssetUrl returns absolute URLs unchanged", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "https://cdn.example.test/maps/page.cog.tif",
      cdnBaseUrl: "https://other.example.test/",
    }),
    "https://cdn.example.test/maps/page.cog.tif",
  );
});
