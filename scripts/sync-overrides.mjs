#!/usr/bin/env node
// Bidirectional sync of data/overrides/ between local and every Fly machine.
//
// Flow:
//   1. List Fly machines for the app.
//   2. SFTP-pull each machine's /data/overrides into a tmp dir.
//   3. LWW-merge local + all remotes by entry-id `edited_at`.
//   4. Write merged set locally (data/overrides/) — staged for `git add`.
//   5. SFTP-push merged set to each machine.
//   6. SSH each machine to run apply-overrides.mjs against its volume DB.
//
// Usage:
//   node scripts/sync-overrides.mjs           # pull, merge, push, rebuild
//   node scripts/sync-overrides.mjs --dry     # pull + merge only, no writes
//   node scripts/sync-overrides.mjs --pull    # pull + merge to local only

import { execFileSync, spawnSync } from "node:child_process";
import { promises as fs, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mergeOverrideSets } from "./lib/merge-overrides.mjs";

const ROOT = process.cwd();
const OVERRIDES_DIR = path.join(ROOT, "data", "overrides");
const FLY_TOML = path.join(ROOT, "fly.toml");

const DRY = process.argv.includes("--dry");
const PULL_ONLY = process.argv.includes("--pull");

function appName() {
  const txt = readFileSync(FLY_TOML, "utf8");
  const m = txt.match(/^app\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("Could not find app name in fly.toml");
  return m[1];
}

function fly(args, opts = {}) {
  return execFileSync("fly", args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });
}

function listMachines(app) {
  const json = fly(["machines", "list", "-a", app, "--json"]);
  const arr = JSON.parse(json);
  return arr.filter((m) => m.state === "started" || m.state === "stopped").map((m) => m.id);
}

function wakeApp(app) {
  // Hit the app so auto-start brings stopped machines up.
  try {
    execFileSync("curl", ["-sf", "-o", "/dev/null", `https://${app}.fly.dev/`], { timeout: 30_000 });
  } catch {
    // ignore — the SSH/SFTP step will fail loudly if app is truly down.
  }
}

function loadDirOverrides(dir) {
  const out = {};
  let files;
  try { files = readdirSync(dir); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f.startsWith("._")) continue; // macOS resource forks leaked into the volume
    try {
      const data = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      Object.assign(out, data);
    } catch (err) {
      console.warn(`  skip ${f}: ${err.message}`);
    }
  }
  return out;
}

function pullMachine(app, machineId, destDir) {
  console.log(`  pulling overrides from machine ${machineId}…`);
  // `fly sftp get` with --recursive copies files into destDir.
  execFileSync(
    "fly",
    ["sftp", "get", "-a", app, "--machine", machineId, "/data/overrides/", `${destDir}/`, "--recursive"],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
}

function pushFile(app, machineId, localFile, remotePath) {
  // The sftp shell only knows cd/ls/get/put/chmod and refuses to overwrite,
  // so delete first via ssh, then put. Two round-trips per file is fine —
  // we only push files that actually changed (see writeMergedLocally caller).
  execFileSync(
    "fly",
    ["ssh", "console", "-a", app, "--machine", machineId, "-C", `rm -f ${remotePath}`],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  const res = spawnSync(
    "fly",
    ["sftp", "shell", "-a", app, "--machine", machineId],
    { input: `put ${localFile} ${remotePath}\n`, stdio: ["pipe", "inherit", "inherit"] }
  );
  if (res.status !== 0) throw new Error(`sftp push failed for ${remotePath}`);
}

function rebuildOnMachine(app, machineId) {
  console.log(`  rebuilding SQLite cache on ${machineId}…`);
  execFileSync(
    "fly",
    ["ssh", "console", "-a", app, "--machine", machineId, "-C",
     "node /app/scripts/apply-overrides.mjs"],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
}

function writeMergedLocally(byStem) {
  // Diff-aware: only rewrite files whose content changed.
  let changed = 0;
  for (const [stem, data] of Object.entries(byStem)) {
    const target = path.join(OVERRIDES_DIR, `${stem}.json`);
    const next = JSON.stringify(data, null, 2);
    let prev = "";
    try { prev = readFileSync(target, "utf8"); } catch { /* new file */ }
    if (prev === next) continue;
    writeFileSync(target, next);
    changed++;
  }
  return changed;
}

async function main() {
  const app = appName();
  console.log(`sync-overrides → app=${app}`);
  wakeApp(app);

  const machines = listMachines(app);
  if (machines.length === 0) {
    console.error("No machines found for app.");
    process.exit(1);
  }
  console.log(`machines: ${machines.join(", ")}`);

  const tmpRoot = mkdtempSync(path.join(tmpdir(), "sync-overrides-"));
  console.log(`tmp: ${tmpRoot}`);

  // 1. Pull each machine into its own subdir. `fly sftp get` refuses to
  //    write into an existing dir, so the subdir must NOT pre-exist.
  const sources = [{ name: "local", data: loadDirOverrides(OVERRIDES_DIR) }];
  for (const id of machines) {
    const dest = path.join(tmpRoot, id);
    pullMachine(app, id, dest);
    sources.push({ name: `fly:${id}`, data: loadDirOverrides(dest) });
  }

  // 2. Merge.
  const { merged, byStem, conflicts } = mergeOverrideSets(sources);
  const total = Object.keys(merged).length;
  console.log(`merged: ${total} entry-ids across ${Object.keys(byStem).length} pages.`);
  if (conflicts.length) {
    console.log(`conflicts resolved by LWW (${conflicts.length}):`);
    for (const c of conflicts) {
      console.log(`  ${c.id} → winner ${c.winner}`);
      for (const s of c.sources) console.log(`    ${s.name}\t${s.edited_at}`);
    }
  }

  if (DRY) {
    console.log("--dry: nothing written.");
    return;
  }

  // 3. Write merged locally.
  const changedLocal = writeMergedLocally(byStem);
  console.log(`local: ${changedLocal} override file(s) updated.`);

  if (changedLocal > 0) {
    console.log("rebuilding local SQLite cache…");
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "apply-overrides.mjs")], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  }

  if (PULL_ONLY) {
    console.log("--pull: skipping push + remote rebuild.");
    return;
  }

  // 4. Push only files that differ from what each machine already has.
  //    Then rebuild the cache. Skip-if-identical means a no-op `npm run sync`
  //    after a clean sync touches nothing on the wire.
  for (const id of machines) {
    const pulledDir = path.join(tmpRoot, id);
    let pushed = 0;
    for (const [stem, data] of Object.entries(byStem)) {
      const local = path.join(OVERRIDES_DIR, `${stem}.json`);
      const remoteCopy = path.join(pulledDir, `${stem}.json`);
      const localBytes = readFileSync(local, "utf8");
      let remoteBytes = null;
      try { remoteBytes = readFileSync(remoteCopy, "utf8"); } catch { /* new file on remote */ }
      // Compare semantically: re-parse both and stringify with the same formatter.
      const localCanon = JSON.stringify(JSON.parse(localBytes));
      const remoteCanon = remoteBytes ? JSON.stringify(JSON.parse(remoteBytes)) : null;
      if (localCanon === remoteCanon) continue;
      pushFile(app, id, local, `/data/overrides/${stem}.json`);
      pushed++;
    }
    console.log(`pushed ${pushed} file(s) to ${id}.`);
    if (pushed > 0) rebuildOnMachine(app, id);
    else console.log(`  no changes for ${id}, skipping rebuild.`);
  }

  console.log("done. review `git status data/overrides/` and commit when ready.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
