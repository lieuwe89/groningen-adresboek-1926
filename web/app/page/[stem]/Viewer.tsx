"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PageData } from "@/lib/data";
import type { SearchHit, SearchResponse } from "@/lib/searchTypes";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchPanel, { type StatusFilter } from "@/components/SearchPanel";
import MapPanel from "@/components/MapPanel";
import ScanPanel from "@/components/ScanPanel";
import GlobalGrid from "@/components/GlobalGrid";

const SEARCH_DEBOUNCE_MS = 220;
const SEARCH_LIMIT = 50;

interface Props {
  stem: string;
  data: PageData;
  prev?: string;
  next?: string;
  editMode?: boolean;
}

export default function Viewer({ stem, data, prev, next, editMode = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(true);
  const [scanOpen, setScanOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Global-search state. Active when query (trimmed) is non-empty.
  const trimmedQuery = query.trim();
  const globalActive = trimmedQuery.length >= 2;
  const [globalResults, setGlobalResults] = useState<SearchHit[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  // Restore query + entry selection from URL params on stem change.
  useEffect(() => {
    const qParam = searchParams.get("q");
    if (qParam) setQuery(qParam);
    const entryParam = searchParams.get("entry");
    if (entryParam) {
      const sep = entryParam.lastIndexOf(":");
      const i = sep > 0 ? Number.parseInt(entryParam.slice(sep + 1), 10) : -1;
      if (Number.isFinite(i) && i >= 0 && i < data.entries.length) {
        setActiveIdx(i);
        setScanOpen(true);
      }
    }
    // Only on stem change (page navigation) — don't react to user typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stem]);

  useEffect(() => {
    if (!globalActive) {
      setGlobalResults([]);
      setGlobalTotal(0);
      setGlobalLoading(false);
      setGlobalError(null);
      return;
    }
    const seq = ++fetchSeq.current;
    setGlobalLoading(true);
    setGlobalError(null);
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const url = `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=${SEARCH_LIMIT}`;
        const res = await fetch(url, { signal: controller.signal });
        if (seq !== fetchSeq.current) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as SearchResponse;
        if (seq !== fetchSeq.current) return;
        setGlobalResults(json.results);
        setGlobalTotal(json.total);
        setGlobalLoading(false);
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        if (seq !== fetchSeq.current) return;
        setGlobalError(e instanceof Error ? e.message : String(e));
        setGlobalLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [trimmedQuery, globalActive]);

  const filtered = useMemo(() => {
    return data.entries
      .map((e, i) => ({ entry: e, idx: i }))
      .filter(({ entry }) => {
        if (filter === "all") return true;
        const f = entry.flags || {};
        if (filter === "verified") return f.verified === true;
        if (filter === "needs_review") return f.needs_review === true;
        if (filter === "unreviewed") return !f.verified && !f.needs_review;
        return true;
      });
  }, [data.entries, filter]);

  const activeEntry = data.entries[activeIdx];

  function handleSelectGlobal(hit: SearchHit) {
    // stable_id format is "<stem>:<idx>" — see scripts/build_db.py.
    if (hit.stem === stem) {
      const sep = hit.stable_id.lastIndexOf(":");
      const i = sep > 0 ? Number.parseInt(hit.stable_id.slice(sep + 1), 10) : -1;
      if (Number.isFinite(i) && i >= 0 && i < data.entries.length) {
        setActiveIdx(i);
        setScanOpen(true);
      }
      return;
    }
    const params = new URLSearchParams({ entry: hit.stable_id, q: trimmedQuery });
    router.push(`/page/${hit.stem}?${params.toString()}`);
  }

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-bp-blue text-bp-ink">
      <GlobalGrid />
      {!focusMode && <Header />}
      <main className="relative flex flex-1 min-h-0 overflow-hidden">
        {!focusMode && (
          <SearchPanel
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            entries={filtered}
            activeIdx={activeIdx}
            onSelect={(i) => {
              setActiveIdx(i);
              setScanOpen(true);
            }}
            query={query}
            onQuery={setQuery}
            filter={filter}
            onFilter={setFilter}
            totalCount={data.entries.length}
            showStatus={editMode}
            globalMode={globalActive}
            globalResults={globalResults}
            globalTotal={globalTotal}
            globalLoading={globalLoading}
            globalError={globalError}
            currentStem={stem}
            onSelectGlobal={handleSelectGlobal}
          />
        )}
        {!focusMode && (
          <MapPanel
            searchOpen={searchOpen}
            scanOpen={scanOpen}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenScan={() => setScanOpen(true)}
          />
        )}
        <ScanPanel
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          stem={stem}
          page={data.page_number}
          activeEntry={activeEntry}
          activeIdx={activeIdx}
          prev={prev}
          next={next}
          editMode={editMode}
          wide={focusMode}
          focusMode={focusMode}
          onToggleFocus={editMode ? () => setFocusMode((v) => !v) : undefined}
        />
      </main>
      {!focusMode && <Footer />}
    </div>
  );
}
