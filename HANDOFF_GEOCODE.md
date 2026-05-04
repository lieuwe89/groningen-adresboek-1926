# Handoff — Run PDOK geocoding on another PC

Goal: geocode all ~36,280 unique addresses in `output/combined/address_index.json`
against PDOK Locatieserver and write the results to
`output/geocoded/addresses.json`.

## Why offload

PDOK API responds in ~10s/req from the macOS box (slow link or DNS). With 20
parallel workers that drops to ~4 req/s effective, so a full run is ~2.5 hours
of unattended wall time. Run it on a machine that can stay on.

## Prereqs

- Python 3.10 or newer (stdlib only — no `pip install` needed).
- The full project synced to the other PC (Google Drive sync, git, or USB).
  Specifically you need:
  - `scripts/geocode_addresses.py`
  - `output/combined/address_index.json` (~14 MB)

That's it. No virtualenv, no extra packages — the script uses only
`urllib`, `json`, `re`, `concurrent.futures` from the standard library.

## Commands

From the project root:

```bash
python scripts/geocode_addresses.py --workers 20
```

(On Windows PowerShell the same command works — `python` resolves to whatever
is on PATH. If `python` is missing try `py -3` or `python3`.)

Notes:
- Default `--workers 20` is conservative. Bump to `--workers 40` if PDOK does
  not start returning 5xx errors. Watch the periodic log lines; if `err=`
  starts climbing, drop workers.
- `--limit N` runs against only the first N pending addresses (use `--limit
  200` to verify the network path works before kicking the full run).
- `--retry-failed` re-attempts addresses previously logged as `no_match` or
  `error`. Skip on the first run; useful if you want to retry after a network
  hiccup.

## Resume / safety

- `output/geocoded/addresses.json` is checkpointed every 500 completions.
- Re-running the script always skips addresses already present in the file
  (unless `--retry-failed` is passed).
- A crash, Ctrl-C, or network drop loses at most ~500 in-flight results;
  re-run to continue.

## Expected output

```
07:26:14 | INFO  | Loaded 36280 unique addresses
07:26:14 | INFO  | Resuming: 0 addresses already attempted
07:26:14 | INFO  | Queued 36183 addresses for PDOK lookup (20 workers)
...periodic [N/36183] lines...
~2.5h later:
==============================================================
Done in 9000s (36183 processed)
  hits:        ~33000
  no_match:    ~2000
  no_number:   ~100
  errors:      0
  cumulative ok: ~33000/36280 (~91%)
  output:      output/geocoded/addresses.json
```

Smoke runs on macOS show **96% hit rate** on the first 100 addresses, so 90%+
across the full set is realistic.

## What the result file looks like

```json
{
  "oosterstraat 4": {
    "status": "ok",
    "query": "oosterstraat 4",
    "lat": 53.21772,
    "lng": 6.56823,
    "score": 17.6,
    "matched": "Oosterstraat 4, 9711 NS Groningen",
    "type": "adres"
  },
  "boterdiep 48": { "status": "ok", "lat": ..., "lng": ..., ... },
  "(en gros)":  { "status": "no_number" },
  "fakestreet 99": { "status": "no_match", "query": "fakestreet 99" }
}
```

Statuses:
- `ok` — geocoded, has `lat`/`lng`/`score`/`matched`
- `no_match` — PDOK returned zero results for the query
- `no_number` — script could not extract a usable street+number
- `error` — HTTP error (rare; re-run with `--retry-failed`)

Quality note: PDOK returns approximate matches when an exact number doesn't
exist on a street. The numeric `score` field reflects match confidence;
downstream use should probably bucket as "high score → drop pin precisely",
"low score → fuzzy circle on the street" rather than treating all `ok`
results as point-accurate.

## Bring it back

After the run finishes you only need to send back one file:

```
output/geocoded/addresses.json
```

Drop it back into the same path on the macOS box (Drive sync, scp, etc.) and
the next pipeline step (SQLite build) will pick it up.

## Stuck?

- If `python scripts/geocode_addresses.py --limit 5` works but the full run
  errors out, that's a transient PDOK problem — re-run with `--retry-failed`.
- If you see `Resuming: N addresses already attempted` and N matches what
  you ran before, the resume is working as intended.
- The script is single-file, ~150 lines; just open it if anything looks off.
