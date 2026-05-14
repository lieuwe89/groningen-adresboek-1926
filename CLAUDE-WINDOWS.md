# Instructions for Claude Code on the Windows PC

Read this **before** doing anything. Then follow `RERUN-RUNBOOK.md`.

## Context

The user is running the Groningen Adresboek 1926 pipeline. The original LLM pass with `gemini-2.5-flash-lite` silently skipped whole columns on dense pages. A pilot with `gemini-2.5-flash` recovered the lost content. We're re-running 363 flagged pages on the Windows PC because the Mac venv is broken (`python3.14` interpreter missing).

The OCR cache is intact and will be reused — **don't re-run OCR**. Only the LLM stage is rerun. Manual edits (413 of them) are preserved via a fingerprint-aware override system.

## Your job

Execute `RERUN-RUNBOOK.md` step by step. Stop and ask the user when:

1. Any pre-flight check fails (step 3).
2. Pilot output looks wrong (step 4: `total_entries < 60`).
3. Audit numbers after rerun miss the targets (step 7).
4. `apply-overrides` reports `not found > 0` (step 8).
5. Any unexpected error in `_pipeline\output\failures\`.

## Hard rules

- **Do not run OCR.** The pipeline auto-skips it when hOCR cache is present. If you find yourself reading `pipeline/ocr.py` to invoke Surya, stop — you're off-path.
- **Do not skip step 4 (pilot).** One page, $0.07, catches API/network/config issues before $24 of waste.
- **Do not skip step 7 (re-audit) before step 8 (rebuild DB).** If the rerun didn't fix coverage, rebuilding the DB locks in the bad state.
- **Do not commit `config_local.py`.** It contains a live API key. It is gitignored — keep it that way.
- **Do not amend or force-push.** This is shared work between two machines; create new commits.

## Windows-specific gotchas

- **Path separators.** The runbook uses `\` for Windows paths. Most Python scripts in this repo use forward slashes in code, but command-line invocations need `\`.
- **`scp` is fine on PowerShell** if OpenSSH is installed. If not, the user transferred this whole folder via cloud / USB — files are already local, just point commands at the right paths.
- **`node scripts\apply-overrides.mjs`** needs Node ≥ 18. The repo's `package.json` should pin a version; verify with `node --version` first.
- **`Tee-Object` vs `tee`.** Use `Tee-Object -FilePath ...` on PowerShell, not `| tee ...`.
- **Long paths.** Windows defaults to a 260-char path limit. If you hit `FileNotFoundError` on long stems, run `git config --system core.longpaths true` once.
- **Line endings.** Don't `git config core.autocrlf true` — it will rewrite line endings on the JSON outputs and pollute the diff. The repo is fine with `core.autocrlf false`.

## Verification checkpoints

After every major step, confirm the side effect happened before moving on.

| Step | Verify |
|---|---|
| 1 (drop files) | `Test-Path _pipeline\pipeline\config_local.py` returns `True` |
| 3 (pre-flight) | All three checks pass |
| 4 (pilot) | Page 0633 returns ~139 entries, 4 streets |
| 5 (prep_rerun --apply) | `Get-ChildItem _pipeline\output\llm_raw\` count dropped by 363 |
| 6 (run_pipeline) | `_pipeline\output\llm_raw\` count returned to original after run |
| 7 (audit) | Overall coverage ≥ 95 %, street_register ≥ 90 % |
| 8 (apply-overrides) | Log shows "413 entries updated, 0 not found" |

## If you need the runbook to evolve

Edit `RERUN-RUNBOOK.md` on this branch and commit. Don't edit the Mac copy at `~/Documents/claude-output/rerun-runbook-2026-05-14.md` — that's frozen as the original plan.

## If you finish successfully

After step 9 push, write a one-paragraph status note to `~/Documents/claude-output/rerun-status-<date>.md` summarizing:

- Final coverage numbers
- Cost (from `_pipeline\output\llm_usage\` totals)
- Pages that still need a `gemini-2.5-pro` pass, if any
- Override fallback count (fingerprint vs stable_id)

Then the user can pick up on the Mac.

## If the branch isn't on origin yet

The Mac side needs to run:

```bash
cd ~/projects/groningen-adresboek-1926
git push origin windows-rerun-package
```

Ask the user to do that before `git pull` in step 2.
