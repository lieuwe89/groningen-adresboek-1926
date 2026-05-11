// LWW merge for override files. Per-entry-id, by `edited_at` (ISO8601).
// Pure: no I/O. Used by sync-overrides.mjs and unit-testable in isolation.

export function tsOf(ov) {
  if (!ov?.edited_at) return 0;
  const t = Date.parse(ov.edited_at);
  return Number.isFinite(t) ? t : 0;
}

// Merge a list of override-file maps (one per source).
// Returns { merged, conflicts } where:
//   merged: OverridesFile  -- per-id winner by latest edited_at
//   conflicts: Array<{ id, winner: string, sources: { name, edited_at }[] }>
//     A conflict is only flagged when two sources have the SAME id
//     with DIFFERENT contents — same content is a no-op.
export function mergeOverrideSets(sources) {
  const merged = {};
  const winnerFrom = {};
  const seenBy = {};

  for (const { name, data } of sources) {
    for (const [id, ov] of Object.entries(data)) {
      (seenBy[id] ??= []).push({ name, ov });
      const prev = merged[id];
      if (!prev || tsOf(ov) > tsOf(prev)) {
        merged[id] = ov;
        winnerFrom[id] = name;
      }
    }
  }

  const conflicts = [];
  for (const [id, seen] of Object.entries(seenBy)) {
    if (seen.length < 2) continue;
    const canon = JSON.stringify(seen[0].ov);
    const divergent = seen.some((s) => JSON.stringify(s.ov) !== canon);
    if (!divergent) continue;
    conflicts.push({
      id,
      winner: winnerFrom[id],
      sources: seen.map((s) => ({ name: s.name, edited_at: s.ov?.edited_at ?? null })),
    });
  }

  // Group merged by stem -> { [stem]: { [id]: ov } } for writing back.
  const byStem = {};
  for (const [id, ov] of Object.entries(merged)) {
    const stem = id.split(":")[0];
    (byStem[stem] ??= {})[id] = ov;
  }

  return { merged, byStem, conflicts };
}
