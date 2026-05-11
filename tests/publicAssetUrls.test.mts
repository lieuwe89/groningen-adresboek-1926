import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAssetBaseUrl,
  normalizeProxyPrefix,
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

test("normalizeProxyPrefix collapses repeated mount path segments", () => {
  assert.equal(normalizeProxyPrefix("/groningen-1926/groningen-1926/"), "/groningen-1926");
});

test("resolvePublicAssetUrl uses the CDN base before the proxy prefix", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "/maps/1536_6133.cog.tif",
      proxyPrefix: "/groningen-1926",
      cdnBaseUrl: "https://cdn.example.test/groningen-1926/",
    }),
    "https://cdn.example.test/groningen-1926/maps/1536_6133.cog.tif",
  );
});

test("resolvePublicAssetUrl falls back to the reverse-proxy prefix", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "tiles/page.dzi",
      proxyPrefix: "/groningen-1926/",
    }),
    "/groningen-1926/tiles/page.dzi",
  );
});

test("resolvePublicAssetUrl collapses duplicated reverse-proxy prefixes", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "/tiles/page.dzi",
      proxyPrefix: "/groningen-1926/groningen-1926",
    }),
    "/groningen-1926/tiles/page.dzi",
  );
});

test("resolvePublicAssetUrl does not prefix an already-prefixed asset path", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "/groningen-1926/tiles/page.dzi",
      proxyPrefix: "/groningen-1926",
    }),
    "/groningen-1926/tiles/page.dzi",
  );
});

test("resolvePublicAssetUrl returns a root path when no CDN or prefix is configured", () => {
  assert.equal(
    resolvePublicAssetUrl({
      assetPath: "tiles/page.dzi",
      proxyPrefix: "",
    }),
    "/tiles/page.dzi",
  );
});
