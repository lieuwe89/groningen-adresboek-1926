# Syncing overrides between local and Fly

## What's the source of truth?

`data/overrides/*.json` is the only canonical store of human edits.
SQLite columns (`name`, `occupation`, …) are a **derived cache** kept in
lockstep by the admin route and by `scripts/apply-overrides.mjs`.

The 59 MB SQLite file is rebuildable, so it is never synced directly.
Only the ~tens-of-KB overrides directory crosses the wire.

## One-command sync (local ⇄ Fly)

```sh
npm run sync       # full: pull each machine, merge, push back, rebuild caches
npm run sync:dry   # pull + merge into memory only, show conflict report
npm run sync:pull  # pull + merge into local files, no push back
```

What it does, in order:

1. Wakes the Fly app (auto-stop is on).
2. Lists every Fly machine for the app and `fly sftp get`'s
   `/data/overrides/` from each into a temp dir.
3. LWW-merges local + every remote per entry-id by `edited_at`.
   Same-content collisions are silent. Real divergences print a report
   showing winner and timestamps.
4. Writes the merged set into `data/overrides/` locally
   (only files whose contents actually changed).
5. Rebuilds the local SQLite cache via `apply-overrides.mjs`.
6. SFTP-pushes the merged set to every machine.
7. SSH-runs `node /app/scripts/apply-overrides.mjs` on each machine
   to rebuild that machine's `/data/adresboek.sqlite` cache.

Volumes on Fly are **per-machine**, so steps 6+7 run once per machine —
otherwise the two HA replicas drift.

After `npm run sync`, review `git status data/overrides/` and commit when
satisfied. Git keeps the history; the merge already resolved conflicts.

## Rebuilding the cache without syncing

```sh
npm run apply-overrides              # rebuild from all override files
npm run apply-overrides <stem>       # rebuild just one page (e.g. 1769_19525-1926_0150)
```

Idempotent. Safe to run any time the cache might be stale (after a
manual JSON edit, after `git pull`, after `build:db`).

The script reads each override and re-issues the same `UPDATE entries
SET …` the admin route would have done. It does **not** call PDOK
geocoding — coords stay as they were. To re-geocode an address, edit
through the admin UI (which triggers PDOK on save).

## Conflict resolution

LWW by `edited_at`. Each override is keyed by `<stem>:<index>`, so two
people can edit different entries on the same page without colliding.
If two sides edit the same entry, the newer timestamp wins. The sync
script prints every divergent id with a winner + per-source timestamps —
review the log if you're worried about clobbering work.

## Why not git autocommit on Fly?

Considered and rejected. The `node:20-alpine` runner has no git, deploy
tokens in containers are an extra secret to manage, and per-machine
volumes mean the two machines would race each other's pushes. The
sftp transport is simpler and the failure mode is "sync command errors
out" rather than "deploy token leaked."
