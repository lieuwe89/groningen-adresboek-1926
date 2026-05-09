import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("saveOverrideBestEffort returns success when the override file cannot be written", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grn-override-save-"));
  const blockedPath = path.join(dir, "not-a-directory");
  writeFileSync(blockedPath, "blocking file");

  const previousOverridesDir = process.env.OVERRIDES_DIR;
  process.env.OVERRIDES_DIR = blockedPath;

  try {
    const moduleUrl = `${pathToFileURL(
      path.join(process.cwd(), "lib", "adminOverrideSave.ts")
    ).href}?test=${Date.now()}`;
    const { saveOverrideBestEffort } = await import(moduleUrl);

    const fallback = {
      fields: { address_number: "1" },
      flags: { verified: true, needs_review: false },
      edited_at: "2026-05-09T16:00:00.000Z",
    };

    const result = await saveOverrideBestEffort(
      "page",
      "page:0",
      fallback,
      () => fallback
    );

    assert.deepEqual(result.override, fallback);
    assert.match(result.warning, /Override file was not written:/);
  } finally {
    if (previousOverridesDir === undefined) {
      delete process.env.OVERRIDES_DIR;
    } else {
      process.env.OVERRIDES_DIR = previousOverridesDir;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
