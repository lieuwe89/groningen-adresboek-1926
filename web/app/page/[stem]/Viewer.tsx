"use client";

import { useMemo, useState } from "react";
import type { PageData } from "@/lib/data";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchPanel, { type StatusFilter } from "@/components/SearchPanel";
import MapPanel from "@/components/MapPanel";
import ScanPanel from "@/components/ScanPanel";
import GlobalGrid from "@/components/GlobalGrid";

interface Props {
  stem: string;
  data: PageData;
  prev?: string;
  next?: string;
  editMode?: boolean;
}

export default function Viewer({ stem, data, prev, next, editMode = false }: Props) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [scanOpen, setScanOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.entries
      .map((e, i) => ({ entry: e, idx: i }))
      .filter(({ entry }) => {
        if (q) {
          const hay = (entry.searchable_text || "").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === "all") return true;
        const f = entry.flags || {};
        if (filter === "verified") return f.verified === true;
        if (filter === "needs_review") return f.needs_review === true;
        if (filter === "unreviewed") return !f.verified && !f.needs_review;
        return true;
      });
  }, [data.entries, query, filter]);

  const activeEntry = data.entries[activeIdx];

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
