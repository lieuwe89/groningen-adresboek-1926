# LLM rerun runbook — Windows PC edition

**Source plan:** `~/Documents/claude-output/rerun-runbook-2026-05-14.md` (Mac), updated 2026-05-14 to reflect the actual branch state and to add Windows-specific commands.

**Goal:** re-extract the **363 pages** whose original LLM pass silently dropped content, with `google/gemini-2.5-flash` instead of `gemini-2.5-flash-lite`. Pilot on the canonical failure page (`1769_19525-1926_0633`) recovered all 12 col-3 entries that were previously lost. Estimated cost: **~$24 for 363 pages**.

**Why now:** overall word coverage was 84.7 % (target ≥ 95 %), street_register coverage 68.6 % (target ≥ 90 %). 363 pages flagged. See `coverage-audit-pre-rerun.md` in this package for the full audit.

**What the rerun preserves:**

- All 413 manual edits (overrides) — fingerprinted snapshot in `edits-snapshot.json` is the safety net. `apply-overrides.mjs` migrates by stable_id, falls back to fingerprint.
- The OCR cache (hOCR + bbox repair). Only the LLM stage is re-invoked.
- The custom street normalization map (`_pipeline/scripts/normalize_streets.py`) — runs at `build_db.py` time, unchanged.

---

## 0. What's in this package

| File | Purpose |
|---|---|
| `RERUN-RUNBOOK.md` | This file. |
| `CLAUDE-WINDOWS.md` | Instructions for Claude Code on the Windows PC. |
| `rerun_stems.txt` | 363 page stems to re-process. Input to `prep_rerun.py`. |
| `edits-snapshot.json` | 339 KB, 413 manual edits with pre-rerun fingerprints. Safety net. |
| `adresboek-backup.sqlite` | 62 MB DB backup. Restore target if rebuild goes wrong. |
| `config_local.py` | **Gitignored.** OpenRouter API key + model config. Drop into `_pipeline/pipeline/`. |
| `coverage-audit-pre-rerun.md` + `.tsv` | Pre-rerun audit numbers, for comparison. |
| `validator/audit_word_coverage.py` | Coverage validator. Untracked in `tables-ocr-pipeline` repo. Use this copy. |
| `validator/coverage-validator.md` | Validator design doc + Stage 2 retry skeleton. |

---

## 1. Drop files into place

Pick locations on the Windows PC:

| Source (this package) | Destination |
|---|---|
| `config_local.py` | `<repo>\_pipeline\pipeline\config_local.py` |
| `rerun_stems.txt` | Anywhere; e.g. `C:\Users\<you>\Documents\claude-output\rerun_stems.txt` |
| `edits-snapshot.json` | Same parent folder as `rerun_stems.txt` |
| `adresboek-backup.sqlite` | Same parent folder |
| `validator\audit_word_coverage.py` | Either `C:\Users\<you>\projects\tables-ocr-pipeline\scripts\` (if cloned) or just call from this folder |

### 1a. Companion outputs bundle (REQUIRED if `_pipeline\output\` is incomplete)

Extract `windows-rerun-outputs-2026-05-14.zip` (companion package, ~54 MB zipped / ~434 MB extracted) into `<repo>`. Merges into the existing `_pipeline\output\` tree. Ships `hocr/`, `llm_raw/`, `json/`, `alto/`, `llm_usage/`, `geocoded/`, `combined/`, `checkpoint.json`.

**Critical:** without `hocr/` the pipeline re-runs OCR (Surya, hours). Without `llm_raw/` it re-extracts all 838 pages (~$60+, undoes the skip logic) instead of just the 363 we want.

Verify counts after extraction:

```powershell
(Get-ChildItem _pipeline\output\hocr\).Count                # expect ~1676
(Get-ChildItem _pipeline\output\llm_raw\).Count             # expect 838
(Get-ChildItem _pipeline\output\json\).Count                # expect 838
Test-Path _pipeline\output\geocoded\addresses.json          # True
Test-Path _pipeline\output\checkpoint.json                  # True
```

See the companion zip's `README.md` for the per-subdir breakdown and what was deliberately NOT shipped (`bag/`, `_backup_pre_reanchor/`, `logs/`).

`<repo>` below = the Windows path of the `groningen-adresboek-1926` checkout. PowerShell examples; adapt to your shell.

---

## 2. Pull the rerun branch

The rerun scripts (`scripts\pilot_llm_rerun.py`, `scripts\prep_rerun.py`, `scripts\snapshot-edits-pre-rerun.mjs`) live on the **`windows-rerun-package`** branch on origin. Check it out before doing anything else.

```powershell
cd <repo>
git fetch origin
git checkout windows-rerun-package
git pull
```

If the branch is missing on origin, ask the Mac side to push it (see `CLAUDE-WINDOWS.md` for the exact command).

---

## 3. Pre-flight checks

```powershell
# Expect exactly:
#   OPENROUTER_MODEL = "google/gemini-2.5-flash"
#   OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-pro"
Select-String -Path _pipeline\pipeline\config_local.py -Pattern '^OPENROUTER_(MODEL|FALLBACK)'

# Python env smoke test
python -c "import openai, surya; print('ok')"

# OCR cache should already be populated — these are the cached hOCR files
# that allow skipping OCR entirely. Expect ~1676.
(Get-ChildItem _pipeline\output\hocr\).Count
```

If `config_local.py` is missing the new model lines, the file wasn't dropped in (step 1). If `import openai, surya` fails, the venv was not rebuilt — see Windows-specific env notes in `CLAUDE-WINDOWS.md`.

---

## 4. Pilot one page (sanity check)

Save 30 seconds of regret by re-piloting on page 0633 from the Windows host. Confirms the API key works, network is fine, and Gemini 2.5 Flash returns ~140 entries.

```powershell
python scripts\pilot_llm_rerun.py 1769_19525-1926_0633 google/gemini-2.5-flash
```

Look for `total_entries` ≈ 139 and `n_streets` = 4 in the summary. Anything below 60 entries → **STOP**, investigate before continuing.

---

## 5. Invalidate cache for the 363 flagged stems

```powershell
# Dry run first
python scripts\prep_rerun.py C:\path\to\rerun_stems.txt
# Expected:
#   Stems to re-run: 363
#   files to delete: 1089
#   checkpoint completed entries to drop: 363
#   checkpoint failed entries to drop: 0

# Apply
python scripts\prep_rerun.py C:\path\to\rerun_stems.txt --apply
```

Deletes `llm_raw\<stem>.json`, `json\<stem>.json`, `llm_usage\<stem>.json`, `failures\<stem>.json` (if any), and drops the matching entries from `_pipeline\output\checkpoint.json`. **The hOCR cache stays** — only the LLM stage re-runs.

---

## 6. Run the LLM stage

```powershell
cd _pipeline
python -m pipeline.run_pipeline
```

`run_pipeline` skips pages whose `llm_raw\<stem>.json` already exists, so it will only touch the 363 stems just invalidated. Default rate cap 30 req/min — expect ~12–14 min API time plus image-encoding overhead. Failed pages auto-retry up to 3 times and are recorded in `_pipeline\output\failures\`.

`Ctrl+C` is safe — checkpoint is updated after every page; resume just re-runs the command.

---

## 7. Re-audit before touching the DB

```powershell
# Adjust validator path to wherever you put audit_word_coverage.py
python C:\path\to\validator\audit_word_coverage.py `
    --hocr-dir _pipeline\output\hocr `
    --json-dir _pipeline\output\json `
    --out-dir  C:\Users\<you>\Documents\claude-output\coverage-audit-post-rerun
```

What "good" looks like:

- Overall coverage: was **84.7 %** → target **≥ 95 %**.
- street_register coverage: was **68.6 %** → target **≥ 90 %**.
- Flagged pages: was **363** → target **≤ 30**, none < 50 % coverage.

If a tail is still flagged, run those through `gemini-2.5-pro` manually with `pilot_llm_rerun.py` and inspect the JSON before committing to a third pass.

---

## 8. Rebuild the DB and re-apply overrides

```powershell
# 8a. Rebuild SQLite from the new JSON output
python _pipeline\scripts\build_db.py

# 8b. Re-attach manual edits. Watch for "resolved by fingerprint fallback"
#     lines — those overrides have stable_ids that shifted and may need
#     migration in the override file later.
node scripts\apply-overrides.mjs 2>&1 | Tee-Object -FilePath C:\Users\<you>\Documents\claude-output\apply-overrides.log
```

Expected log pattern:

```
apply-overrides: 55 page(s), 413 entries updated, 0 not found, N resolved by fingerprint fallback.
```

If `not found > 0`: those overrides reference entries the LLM dropped on the rerun. Cross-check against `edits-snapshot.json` and decide whether to restore from snapshot or accept the loss. **Do not proceed to step 9 with unresolved `not found` rows.**

---

## 9. Ship back to Mac / Fly

```powershell
git add _pipeline\output\json _pipeline\output\llm_raw _pipeline\output\llm_usage _pipeline\output\checkpoint.json
git commit -m "rerun: 363 pages on gemini-2.5-flash"
git push origin windows-rerun-package
```

On the Mac after the push:

```bash
git fetch origin
git checkout main
git merge --ff-only origin/windows-rerun-package  # or open a PR
npm run sync   # push the rebuilt DB + overrides to Fly
```

---

## Recovery

| Problem | Fix |
|---|---|
| DB corrupted or rebuild garbage | `cp adresboek-backup.sqlite <repo>\data\adresboek.sqlite` |
| Override fingerprint mismatch | Consult `edits-snapshot.json` — has all 413 rows with full field values pre-rerun |
| Pipeline hangs on a stem | Check `_pipeline\output\failures\<stem>.json` — kill, fix or skip stem, restart (resumes from checkpoint) |
| Bail entirely | `git checkout main -- _pipeline\output` undoes JSON changes; restore DB from backup |

---

## Optional follow-up: stage 2 auto-retry

Not implemented yet. If you want flagged-on-the-rerun pages to escalate automatically to `gemini-2.5-pro`, add a coverage-check + retry to `_pipeline\pipeline\llm.py:process_page_with_gemini`. Skeleton in `validator\coverage-validator.md` § "Stage 2". ~30 lines, low risk. Worth doing **before** any future source is harvested at scale; not strictly needed for this rerun if step 7 shows clean numbers.
