import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { getJsonDir, getOverridesDir } from "../lib/projectPaths.js";

test("project data paths use configured absolute env paths when present", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grn-stats-json-"));
  const overridesDir = mkdtempSync(path.join(tmpdir(), "grn-stats-overrides-"));
  const previousJsonDir = process.env.JSON_DIR;
  const previousOverridesDir = process.env.OVERRIDES_DIR;
  process.env.JSON_DIR = dir;
  process.env.OVERRIDES_DIR = overridesDir;

  try {
    assert.equal(getJsonDir(), dir);
    assert.equal(getOverridesDir(), overridesDir);
  } finally {
    if (previousJsonDir === undefined) {
      delete process.env.JSON_DIR;
    } else {
      process.env.JSON_DIR = previousJsonDir;
    }
    if (previousOverridesDir === undefined) {
      delete process.env.OVERRIDES_DIR;
    } else {
      process.env.OVERRIDES_DIR = previousOverridesDir;
    }
    rmSync(dir, { recursive: true, force: true });
    rmSync(overridesDir, { recursive: true, force: true });
  }
});

test("project data paths default to repo-local pipeline and overrides directories", () => {
  const previousJsonDir = process.env.JSON_DIR;
  const previousOverridesDir = process.env.OVERRIDES_DIR;
  delete process.env.JSON_DIR;
  delete process.env.OVERRIDES_DIR;

  try {
    assert.equal(
      getJsonDir(),
      path.resolve(process.cwd(), "_pipeline", "output", "json")
    );
    assert.equal(getOverridesDir(), path.resolve(process.cwd(), "data", "overrides"));
  } finally {
    if (previousJsonDir !== undefined) process.env.JSON_DIR = previousJsonDir;
    if (previousOverridesDir !== undefined) process.env.OVERRIDES_DIR = previousOverridesDir;
  }
});
