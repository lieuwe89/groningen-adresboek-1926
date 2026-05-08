"use client";

import type { Entry } from "@/lib/data";
import type { PersonHit, SearchMention } from "@/lib/searchTypes";
import { useTranslations } from 'next-intl';

export type StatusFilter = "all" | "verified" | "needs_review" | "unreviewed";

interface Props {
  open: boolean;
  onClose: () => void;
  entries: { entry: Entry; idx: number }[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  query: string;
  onQuery: (s: string) => void;
  filter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  totalCount: number;
  showStatus?: boolean;
  // Global search mode: when query is non-empty, parent fetches /api/search
  // and passes results here. When undefined, render local page entries.
  globalMode?: boolean;
  globalResults?: PersonHit[];
  globalTotal?: number;
  globalLoading?: boolean;
  globalError?: string | null;
  currentStem?: string;
  activeEntryId?: string;
  onSelectGlobal?: (hit: SearchMention) => void;
}

export default function SearchPanel(p: Props) {
  const t = useTranslations('Search');
  const tc = useTranslations('Common');

  return (
    <div
      className="overflow-hidden flex-shrink-0 border-r border-bp-ink/55 bg-bp-blue"
      style={{
        width: p.open ? 295 : 0,
        transition: "width 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <aside id="tour-search-panel" style={{ width: 295 }} className="h-full flex flex-col">
        {/* Header row */}
        <div
          className="flex items-center justify-between border-b border-bp-ink/55"
          style={{ padding: "5px 13px 4px" }}
        >
          <span
            className="text-bp-amber uppercase"
            style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
          >
            {t('title')}
          </span>
          <button
            onClick={p.onClose}
            className="text-bp-ink-dim hover:text-bp-amber transition-colors"
            style={{ fontSize: 10 }}
            aria-label="Sluit zoekpanel"
          >
            ✕
          </button>
        </div>

        {/* Search field */}
        <div className="px-[13px] pt-[12px] pb-[8px]">
          <div
            className="relative flex items-center gap-[8px]"
            style={{
              border: "1px solid #e8b84c88",
              background: "#e8b84c08",
              padding: "10px 11px",
            }}
          >
            <CornerTicks />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e8b84c" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              placeholder={t('placeholder')}
              className="flex-1 bg-transparent outline-none text-bp-ink-bright uppercase"
              style={{ fontSize: 10, letterSpacing: "0.12em", fontWeight: 700 }}
            />
            <span className="bg-bp-amber inline-block" style={{ width: 1.5, height: 13 }} />
          </div>
        </div>

        {p.showStatus && (
          <div className="px-[13px] flex gap-[2px]">
            <FilterBtn label="Alle" id="all" active={p.filter === "all"} onClick={() => p.onFilter("all")} />
            <FilterBtn label="Goed" id="verified" active={p.filter === "verified"} onClick={() => p.onFilter("verified")} />
            <FilterBtn label="Twijfel" id="needs_review" active={p.filter === "needs_review"} onClick={() => p.onFilter("needs_review")} />
            <FilterBtn label="Open" id="unreviewed" active={p.filter === "unreviewed"} onClick={() => p.onFilter("unreviewed")} />
          </div>
        )}

        {/* Results header */}
        <div
          className="flex items-center justify-between mt-[12px] px-[13px] pb-[6px] border-b border-bp-ink/15"
        >
          <span
            className="text-bp-ink-dim uppercase"
            style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
          >
            {t('results')}
          </span>
          <span className="text-bp-amber" style={{ fontSize: 10, fontWeight: 700 }}>
            {p.globalMode
              ? p.globalLoading
                ? "…"
                : p.globalTotal ?? 0
              : p.entries.length}
          </span>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {p.globalMode ? (
            <GlobalResults
              results={p.globalResults || []}
              total={p.globalTotal || 0}
              loading={!!p.globalLoading}
              error={p.globalError || null}
              currentStem={p.currentStem}
              activeEntryId={p.activeEntryId}
              onSelect={p.onSelectGlobal}
            />
          ) : (
            p.entries.map(({ entry, idx }) => {
            const active = idx === p.activeIdx;
            const name = formatName(entry);
            const occ = entry.occupation_expanded || entry.occupation || "";
            const addr = entry.address_full || "";
            const statusColor = !p.showStatus
              ? null
              : entry.flags?.verified
              ? "#7fc97f"
              : entry.flags?.needs_review
              ? "#e8b84c"
              : null;
            return (
              <button
                key={idx}
                onClick={() => p.onSelect(idx)}
                className="w-full text-left flex flex-col gap-[3px]"
                style={{
                  padding: "10px 13px",
                  background: active ? "#e8b84c0c" : "transparent",
                  borderLeft: active ? "2px solid #e8b84c" : "2px solid transparent",
                }}
              >
                <span
                  className="flex items-center gap-[6px]"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                    color: active ? "#e8b84c" : "#e6d9b0",
                  }}
                >
                  {statusColor && (
                    <span
                      title={entry.flags?.verified ? "Geverifieerd" : "Te controleren"}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: statusColor,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {name || "—"}
                </span>
                <span
                  className="text-bp-ink-dim"
                  style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
                >
                  {occ}
                </span>
                <div className="flex items-center justify-between">
                  <span
                    className="text-bp-ink-dim"
                    style={{ fontSize: 8.5 }}
                  >
                    {addr}
                  </span>
                </div>
              </button>
            );
            })
          )}
          {!p.globalMode && p.entries.length === 0 && (
            <div className="px-[13px] py-[20px] text-bp-ink-dim" style={{ fontSize: 9 }}>
              Geen resultaten op deze pagina.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t border-bp-ink/55 px-[13px] py-[6px] text-bp-ink-dim uppercase"
          style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
        >
          {p.globalMode
            ? `Afd. I — Boekzoeken · ${p.globalTotal ?? 0} treffers`
            : `Afd. I — Persoonsgegevens · ${p.totalCount} totaal`}
        </div>
      </aside>
    </div>
  );
}

function CornerTicks() {
  const corner = (style: React.CSSProperties) => (
    <span
      style={{
        position: "absolute",
        width: 5,
        height: 5,
        border: "1px solid #e8b84c",
        background: "#182d5c",
        ...style,
      }}
    />
  );
  return (
    <>
      {corner({ top: -3, left: -3 })}
      {corner({ top: -3, right: -3 })}
      {corner({ bottom: -3, left: -3 })}
      {corner({ bottom: -3, right: -3 })}
    </>
  );
}

function FilterBtn({
  label,
  id,
  active,
  onClick,
}: {
  label: string;
  id: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 uppercase transition-colors"
      style={{
        fontSize: 8,
        letterSpacing: "0.12em",
        fontWeight: 700,
        padding: "5px 4px",
        border: active ? "1px solid #e8b84c88" : "1px solid #7a705444",
        background: active ? "#e8b84c10" : "transparent",
        color: active ? "#e8b84c" : "#7a7054",
      }}
      data-id={id}
    >
      {label}
    </button>
  );
}

function formatName(e: Entry): string {
  const parts = [e.name, e.initials, e.name_prefix].filter(Boolean);
  return parts.join(" ");
}

function formatMentionName(h: SearchMention): string {
  return [h.name, h.initials].filter(Boolean).join(" ");
}

function GlobalResults({
  results,
  total,
  loading,
  error,
  currentStem,
  activeEntryId,
  onSelect,
}: {
  results: PersonHit[];
  total: number;
  loading: boolean;
  error: string | null;
  currentStem?: string;
  activeEntryId?: string;
  onSelect?: (h: SearchMention) => void;
}) {
  if (error) {
    return (
      <div className="px-[13px] py-[20px] text-bp-amber" style={{ fontSize: 9 }}>
        {error}
      </div>
    );
  }
  if (loading && results.length === 0) {
    return (
      <div className="px-[13px] py-[20px] text-bp-ink-dim" style={{ fontSize: 9 }}>
        Zoeken…
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="px-[13px] py-[20px] text-bp-ink-dim" style={{ fontSize: 9 }}>
        Geen resultaten in het hele boek.
      </div>
    );
  }
  return (
    <>
      {results.map((p) => {
        // Find best name/occ/addr for this cluster to display as the header
        // For unclustered entries (mentions.length === 1), use its own data.
        const headerName = p.canonical_name || formatMentionName(p.mentions[0]) || "—";
        const headerOcc = p.canonical_occupation || p.mentions[0].occupation_expanded || p.mentions[0].occupation || "";
        const headerAddr = p.canonical_address || p.mentions[0].address_full || "";
        
        return (
          <div key={p.cluster_id} className="w-full flex flex-col mb-[8px] border-b border-bp-ink/15 pb-[8px]">
            {/* Person Header */}
            <div className="px-[13px] py-[6px] flex flex-col gap-[3px]">
              <span
                className="flex items-center gap-[6px]"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "#e6d9b0",
                }}
              >
                {headerName}
              </span>
              <span
                className="text-bp-ink-dim"
                style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
              >
                {headerOcc}
              </span>
              <span className="text-bp-ink-dim truncate" style={{ fontSize: 8.5 }}>
                {headerAddr}
              </span>
            </div>
            
            {/* Mentions List */}
            <div className="flex flex-col mt-[4px]">
              {p.mentions.map((m) => {
                const onCurrent = m.stem === currentStem;
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelect?.(m)}
                    className="w-full text-left flex items-center justify-between"
                    style={{
                      padding: "6px 13px",
                      background: m.stable_id === activeEntryId ? "#e8b84c1a" : onCurrent ? "#e8b84c06" : "transparent",
                      borderLeft: m.stable_id === activeEntryId ? "2px solid #e8b84c" : onCurrent ? "2px solid #e8b84c44" : "2px solid transparent",
                    }}
                  >
                    <span
                      className="text-bp-ink-dim truncate"
                      style={{ fontSize: 8.5, color: onCurrent ? "#e8b84c" : undefined }}
                    >
                      {/* Only show address and occ here if they differ or just show "Vermelding" */}
                      {m.occupation || "Vermelding"} {m.address_full ? `- ${m.address_full}` : ""}
                    </span>
                    <span
                      className="text-bp-amber flex-shrink-0 uppercase ml-[8px]"
                      style={{ fontSize: 8, letterSpacing: "0.12em", fontWeight: 700 }}
                    >
                      p. {m.page_number ?? "?"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {total > results.length && (
        <div
          className="px-[13px] py-[10px] text-bp-ink-dim text-center uppercase"
          style={{ fontSize: 8, letterSpacing: "0.18em" }}
        >
          {results.length} van {total} clusters
        </div>
      )}
    </>
  );
}
