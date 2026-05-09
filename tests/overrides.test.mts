import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("updateOverride preserves concurrent updates to the same page file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grn-overrides-"));
  const previousOverridesDir = process.env.OVERRIDES_DIR;
  process.env.OVERRIDES_DIR = dir;

  try {
    const moduleUrl = `${pathToFileURL(
      path.join(process.cwd(), "lib", "overrides.ts")
    ).href}?test=${Date.now()}`;
    const { updateOverride } = await import(moduleUrl);

    await Promise.all([
      updateOverride("page", "page:0", () => ({
        fields: { name: "Smith" },
        edited_at: "2026-05-09T10:00:00.000Z",
      })),
      updateOverride("page", "page:1", () => ({
        fields: { name: "Jones" },
        edited_at: "2026-05-09T10:00:01.000Z",
      })),
    ]);

    const raw = await readFile(path.join(dir, "page.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed["page:0"].fields.name, "Smith");
    assert.equal(parsed["page:1"].fields.name, "Jones");
  } finally {
    if (previousOverridesDir === undefined) {
      delete process.env.OVERRIDES_DIR;
    } else {
      process.env.OVERRIDES_DIR = previousOverridesDir;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
