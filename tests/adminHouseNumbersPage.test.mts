import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("house number correction page renders dynamically so reloads read current SQLite rows", () => {
  const pageFile = path.join(
    process.cwd(),
    "app",
    "[locale]",
    "admin",
    "house-numbers",
    "page.tsx"
  );
  const source = readFileSync(pageFile, "utf8");

  assert.match(source, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
});
