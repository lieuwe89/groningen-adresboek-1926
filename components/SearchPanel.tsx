"use client";

import type { Entry } from "@/lib/data";
import type { PersonHit, SearchMention } from "@/lib/searchTypes";
import { formatEntryName, presentEntry } from "@/lib/entryPresentation";
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
  activeEntryId?: string;
  onSelectGlobal?: (hit: SearchMention) => void;
  fuzzy?: boolean;
  onFuzzy?: (f: boolean) => void;
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
            aria-label={t('closeAriaLabel')}
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

        {p.globalMode && (
          <div className="px-[13px] pb-[6px] flex items-center gap-[6px]">
            <input
              type="checkbox"
              id="fuzzy-toggle"
              checked={p.fuzzy ?? false}
              onChange={(e) => p.onFuzzy?.(e.target.checked)}
              style={{ accentColor: "#e8b84c", width: 10, height: 10, cursor: "pointer" }}
            />
            <label
              htmlFor="fuzzy-toggle"
              className="text-bp-ink-dim uppercase cursor-pointer select-none"
              style={{ fontSize: 8, letterSpacing: "0.12em", fontWeight: 600, color: p.fuzzy ? "#e8b84c" : undefined }}
            >
              Fuzzy search
            </label>
          </div>
        )}

        {p.showStatus && (
          <div className="px-[13px] flex gap-[2px]">
            <FilterBtn label={t('filterAll')} id="all" active={p.filter === "all"} onClick={() => p.onFilter("all")} />
            <FilterBtn label={t('filterGood')} id="verified" active={p.filter === "verified"} onClick={() => p.onFilter("verified")} />
            <FilterBtn label={t('filterUncertain')} id="needs_review" active={p.filter === "needs_review"} onClick={() => p.onFilter("needs_review")} />
            <FilterBtn label={t('filterOpen')} id="unreviewed" active={p.filter === "unreviewed"} onClick={() => p.onFilter("unreviewed")} />
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
              activeEntryId={p.activeEntryId}
              onSelect={p.onSelectGlobal}
              t={t}
            />
          ) : (
            p.entries.map(({ entry, idx }) => {
            const active = idx === p.activeIdx;
            const display = presentEntry(entry);
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
                      title={entry.flags?.verified ? t('statusVerified') : t('statusNeedsReview')}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: statusColor,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {display.badge && (
                    <span
                      className="text-bp-amber uppercase"
                      style={{ fontSize: 7, letterSpacing: "0.12em", fontWeight: 700 }}
                    >
                      {display.badge}
                    </span>
                  )}
                  {display.title}
                </span>
                <span
                  className="text-bp-ink-dim"
                  style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
                >
                  {display.subtitle}
                </span>
                <div className="flex items-center justify-between">
                  <span
                    className="text-bp-ink-dim"
                    style={{ fontSize: 8.5 }}
                  >
                    {display.address}
                  </span>
                </div>
              </button>
            );
            })
          )}
          {!p.globalMode && p.entries.length === 0 && (
            <div className="px-[13px] py-[20px] text-bp-ink-dim" style={{ fontSize: 9 }}>
              {t('noResultsOnPage')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t border-bp-ink/55 px-[13px] py-[6px] text-bp-ink-dim uppercase"
          style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
        >
          {p.globalMode
            ? t('footerGlobal', { count: p.globalTotal ?? 0 })
            : t('footerLocal', { count: p.totalCount })}
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

function formatMentionName(h: SearchMention): string {
  return formatEntryName(h);
}

function mentionLine(m: SearchMention, entryFallback: string): string {
  const display = presentEntry(m, m.section);
  const detail = display.detail !== "-" ? display.detail : display.badge || entryFallback;
  return [detail, display.address].filter(Boolean).join(" - ");
}

type SearchTranslator = ReturnType<typeof useTranslations<'Search'>>;

function GlobalResults({
  results,
  total,
  loading,
  error,
  activeEntryId,
  onSelect,
  t,
}: {
  results: PersonHit[];
  total: number;
  loading: boolean;
  error: string | null;
  activeEntryId?: string;
  onSelect?: (h: SearchMention) => void;
  t: SearchTranslator;
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
        {t('searching')}
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="px-[13px] py-[20px] text-bp-ink-dim" style={{ fontSize: 9 }}>
        {t('noResultsGlobal')}
      </div>
    );
  }
  const entryFallback = t('entryFallback');
  return (
    <>
      {results.map((p) => {
        // Find best name/occ/addr for this cluster to display as the header
        // For unclustered entries (mentions.length === 1), use its own data.
        const firstDisplay = presentEntry(p.mentions[0], p.mentions[0].section);
        const headerName = p.canonical_name || formatMentionName(p.mentions[0]) || "—";
        const headerOcc = p.canonical_occupation || firstDisplay.subtitle || "";
        const headerAddr = p.canonical_address || firstDisplay.address || "";
        
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
                {firstDisplay.badge && (
                  <span
                    className="text-bp-amber uppercase"
                    style={{ fontSize: 7, letterSpacing: "0.12em", fontWeight: 700 }}
                  >
                    {firstDisplay.badge}
                  </span>
                )}
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
                const active = m.stable_id === activeEntryId;
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelect?.(m)}
                    className="w-full text-left flex items-center justify-between"
                    style={{
                      padding: "6px 13px",
                      background: active ? "#e8b84c1a" : "transparent",
                      borderLeft: active ? "2px solid #e8b84c" : "2px solid transparent",
                    }}
                  >
                    <span
                      className="text-bp-ink-dim truncate"
                      style={{ fontSize: 8.5, color: active ? "#e8b84c" : undefined }}
                    >
                      {/* Only show address and occ here if they differ or just show "Vermelding" */}
                      {mentionLine(m, entryFallback)}
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
          {t('clustersOf', { shown: results.length, total })}
        </div>
      )}
    </>
  );
}
