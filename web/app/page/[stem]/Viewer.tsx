"use client";

import { useEffect, useMemo } from "react";
import type { PageData } from "@/lib/data";
import ScanPanel from "@/components/ScanPanel";
import { useSelection } from "@/lib/SelectionContext";

interface Props {
  stem: string;
  data: PageData;
  prev?: string;
  next?: string;
  editMode?: boolean;
  initialIdx?: number;
}

export default function Viewer({
  stem,
  data,
  prev,
  next,
  editMode = false,
  initialIdx = 0,
}: Props) {
  const {
    activeIdx,
    setActiveIdx,
    setLocalEntries,
    setOnSelectLocal,
    setActivePandId,
    scanOpen,
    setScanOpen,
    filter,
  } = useSelection();

  // Sync initial selection from prop
  useEffect(() => {
    setActiveIdx(initialIdx);
  }, [initialIdx, setActiveIdx]);

  // Sync local entries for the search panel
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

  useEffect(() => {
    setLocalEntries(filtered);
  }, [filtered, setLocalEntries]);

  // Provide local selection handler to the shell
  useEffect(() => {
    setOnSelectLocal(() => (i: number) => {
      setActiveIdx(i);
      setScanOpen(true);
    });
  }, [setActiveIdx, setScanOpen, setOnSelectLocal]);

  // Update map focus building
  const activeEntry = data.entries[activeIdx];
  useEffect(() => {
    setActivePandId(activeEntry?.pand_id ?? null);
  }, [activeEntry, setActivePandId]);

  return (
    <ScanPanel
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      stem={stem}
      page={data.page_number}
      entries={data.entries}
      activeEntry={activeEntry}
      activeIdx={activeIdx}
      prev={prev}
      next={next}
      editMode={editMode}
    />
  );
}
