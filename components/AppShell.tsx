"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchPanel, { type StatusFilter } from "@/components/SearchPanel";
import MapPanel from "@/components/MapPanel";
import GlobalGrid from "@/components/GlobalGrid";
import { useSelection } from "@/lib/SelectionContext";
import WelcomeModal from "@/components/WelcomeModal";
import { useTour } from "@/lib/useTour";
import type { PersonHit, SearchMention, SearchResponse } from "@/lib/searchTypes";
import type { BuildingDetail } from "@/lib/db";
import { useLocale, useTranslations } from 'next-intl';
import { isPhone } from "@/lib/isPhone";
import { useIsAdminRoute } from "@/lib/AdminContext";

const SEARCH_DEBOUNCE_MS = 220;
const SEARCH_LIMIT = 50;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname() || "";
  const isAdmin = useIsAdminRoute();

  const {
    activePandId,
    query,
    setQuery,
    fuzzy,
    setFuzzy,
    searchOpen,
    setSearchOpen,
    scanOpen,
    setScanOpen,
    globalResults,
    setGlobalResults,
    globalTotal,
    setGlobalTotal,
    globalLoading,
    setGlobalLoading,
    globalError,
    setGlobalError,
    filter,
    setFilter,
    localEntries,
    activeIdx,
    onSelectLocal,
  } = useSelection();

  const searchParams = useSearchParams();
  const fetchSeq = useRef(0);

  // Phones open on the map (both flags start true, which there means the search panel on top).
  // A link to one entry keeps the scan in front. Layout effect: before the first paint after hydration.
  useLayoutEffect(() => {
    if (!isPhone()) return;
    setSearchOpen(false);
    setScanOpen(new URLSearchParams(window.location.search).has("entry"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastUrlQuery = useRef<string | null>(null);
  useEffect(() => {
    const q = searchParams.get("q") || "";
    if (q !== lastUrlQuery.current) {
      lastUrlQuery.current = q;
      if (q !== query) {
        setQuery(q);
      }
    }
  }, [searchParams, query, setQuery]);

  const trimmedQuery = query.trim();
  const globalActive = trimmedQuery.length >= 2;

  // Handle global search
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
        const fuzzyParam = fuzzy ? "&fuzzy=1" : "";
        const url = `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=${SEARCH_LIMIT}${fuzzyParam}`;
        const res = await fetch(url, { signal: controller.signal });
        if (seq !== fetchSeq.current) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SearchResponse;
        if (seq !== fetchSeq.current) return;
        setGlobalResults(json.results);
        setGlobalTotal(json.total);
        setGlobalLoading(false);
      } catch (e) {
        if ((e as any).name === "AbortError") return;
        if (seq !== fetchSeq.current) return;
        setGlobalError(e instanceof Error ? e.message : String(e));
        setGlobalLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [trimmedQuery, fuzzy, globalActive, setGlobalResults, setGlobalTotal, setGlobalLoading, setGlobalError]);

  function handleSelectGlobal(hit: SearchMention) {
    const p = new URLSearchParams({ entry: hit.stable_id, q: trimmedQuery });
    const base = isAdmin ? `/${locale}/admin/page` : `/${locale}/page`;
    router.push(`${base}/${hit.stem}?${p.toString()}`);
    showScanOnPhone();
  }

  // Phones show one panel at a time: the search panel lies over the scan panel, which lies over the map.
  // A chosen result must therefore bring the scan to the front; on wider screens all three stay side by side.
  function showScanOnPhone() {
    if (!isPhone()) return;
    setSearchOpen(false);
    setScanOpen(true);
  }

  // Sync local query back to URL (debounced)
  useEffect(() => {
    const handle = setTimeout(() => {
      const currentQ = searchParams.get("q") || "";
      if (query !== currentQ) {
        const p = new URLSearchParams(searchParams.toString());
        if (query) p.set("q", query);
        else p.delete("q");
        router.replace(`${pathname}?${p.toString()}`, { scroll: false });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [query, pathname, router, searchParams]);

  const { startTour } = useTour();
  const tm = useTranslations('Map');
  const phoneTab = searchOpen ? "search" : scanOpen ? "scan" : "map";

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-bp-blue text-bp-ink">
      <GlobalGrid />
      <Header activeIdx={activeIdx} currentSearch={searchParams.toString()} />
      <main className="relative flex flex-1 min-h-0 overflow-hidden">
        <SearchPanel
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          entries={localEntries}
          activeIdx={activeIdx}
          onSelect={(i) => {
            onSelectLocal(i);
            showScanOnPhone();
          }}
          query={query}
          onQuery={setQuery}
          filter={filter as StatusFilter}
          onFilter={(f) => setFilter(f)}
          totalCount={localEntries.length}
          globalMode={globalActive}
          globalResults={globalResults}
          globalTotal={globalTotal}
          globalLoading={globalLoading}
          globalError={globalError}
          activeEntryId={searchParams.get("entry") || undefined}
          onSelectGlobal={handleSelectGlobal}
          fuzzy={fuzzy}
          onFuzzy={setFuzzy}
        />
        <MapPanel
          searchOpen={searchOpen}
          scanOpen={scanOpen}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenScan={() => setScanOpen(true)}
          focusPandId={activePandId}
        />
        {children}
      </main>
      <nav className="md:hidden flex border-t border-bp-ink/55">
        <PhoneTab label={tm('search')} active={phoneTab === "search"} onClick={() => setSearchOpen(true)} />
        <PhoneTab
          label={tm('map')}
          active={phoneTab === "map"}
          onClick={() => {
            setSearchOpen(false);
            setScanOpen(false);
          }}
        />
        <PhoneTab
          label={tm('scan')}
          active={phoneTab === "scan"}
          onClick={() => {
            setSearchOpen(false);
            setScanOpen(true);
          }}
        />
      </nav>
      <Footer className="max-md:hidden" />
      <WelcomeModal onStartTour={startTour} />
    </div>
  );
}

function PhoneTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="flex-1 uppercase font-bold"
      style={{
        height: 48,
        fontSize: 12,
        letterSpacing: "0.18em",
        color: active ? "var(--color-bp-amber)" : "var(--color-bp-ink-dim)",
        background: active ? "color-mix(in srgb, var(--color-bp-amber) 8%, transparent)" : "transparent",
        boxShadow: active ? "inset 0 2px 0 var(--color-bp-amber)" : "none",
      }}
    >
      {label}
    </button>
  );
}
