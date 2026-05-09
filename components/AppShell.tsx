"use client";

import { useEffect, useRef } from "react";
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
import { useLocale } from 'next-intl';
import { useProxyUrl } from "@/lib/useProxyUrl";

const SEARCH_DEBOUNCE_MS = 220;
const SEARCH_LIMIT = 50;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname() || "";
  const isAdmin = pathname.includes("/admin");
  const { proxyPath } = useProxyUrl();
  
  const {
    activePandId,
    query,
    setQuery,
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
        const url = proxyPath(`/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=${SEARCH_LIMIT}`);
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
  }, [trimmedQuery, globalActive, setGlobalResults, setGlobalTotal, setGlobalLoading, setGlobalError]);

  function handleSelectGlobal(hit: SearchMention) {
    const p = new URLSearchParams({ entry: hit.stable_id, q: trimmedQuery });
    const base = isAdmin ? `/${locale}/admin/page` : `/${locale}/page`;
    router.push(proxyPath(`${base}/${hit.stem}?${p.toString()}`));
  }

  // Sync local query back to URL (debounced)
  useEffect(() => {
    const handle = setTimeout(() => {
      const currentQ = searchParams.get("q") || "";
      if (query !== currentQ) {
        const p = new URLSearchParams(searchParams.toString());
        if (query) p.set("q", query);
        else p.delete("q");
        router.replace(proxyPath(`${pathname}?${p.toString()}`), { scroll: false });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [query, pathname, router, searchParams]);

  const { startTour } = useTour();

  return (
    <div className="relative flex flex-col w-full h-full overflow-hidden bg-bp-blue text-bp-ink">
      <GlobalGrid />
      <Header />
      <main className="relative flex flex-1 min-h-0 overflow-hidden">
        <SearchPanel
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          entries={localEntries}
          activeIdx={activeIdx}
          onSelect={onSelectLocal}
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
      <Footer />
      <WelcomeModal onStartTour={startTour} />
    </div>
  );
}
