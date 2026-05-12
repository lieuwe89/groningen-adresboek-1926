import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const moduleUrl = pathToFileURL(
  path.join(process.cwd(), "lib", "entryRouteTargets.ts")
).href;

async function loadModule() {
  return await import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

test("buildPageModeHref carries the active entry into the admin page route", async () => {
  const { buildPageModeHref } = await loadModule();

  const href = buildPageModeHref({
    locale: "nl",
    mode: "admin",
    stem: "1769_19525-1926_0150",
    activeIdx: 37,
    currentSearch: "q=Jansen",
  });

  assert.equal(
    href,
    "/nl/admin/page/1769_19525-1926_0150?q=Jansen&entry=1769_19525-1926_0150%3A37"
  );
});

test("buildPageModeHref carries the active entry back to the public page route", async () => {
  const { buildPageModeHref } = await loadModule();

  const href = buildPageModeHref({
    locale: "en",
    mode: "public",
    stem: "1769_19525-1926_0240",
    activeIdx: 5,
    currentSearch: "q=Bakker&entry=1769_19525-1926_0240%3A2",
  });

  assert.equal(
    href,
    "/en/page/1769_19525-1926_0240?q=Bakker&entry=1769_19525-1926_0240%3A5"
  );
});

test("buildPageModeHref keeps a same-page entry param when active index is unavailable", async () => {
  const { buildPageModeHref } = await loadModule();

  const href = buildPageModeHref({
    locale: "nl",
    mode: "admin",
    stem: "1769_19525-1926_0349",
    activeIdx: -1,
    currentSearch: "entry=1769_19525-1926_0349%3A12&q=mulder",
  });

  assert.equal(
    href,
    "/nl/admin/page/1769_19525-1926_0349?entry=1769_19525-1926_0349%3A12&q=mulder"
  );
});

test("buildPageModeHref drops stale entry params when building another page route", async () => {
  const { buildPageModeHref } = await loadModule();

  const href = buildPageModeHref({
    locale: "nl",
    mode: "admin",
    stem: "1769_19525-1926_0350",
    currentSearch: "entry=1769_19525-1926_0349%3A12&q=mulder",
  });

  assert.equal(href, "/nl/admin/page/1769_19525-1926_0350?q=mulder");
});
