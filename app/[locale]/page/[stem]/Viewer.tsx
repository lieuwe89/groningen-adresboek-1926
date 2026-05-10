"use client";

import { useEffect, useMemo, useState } from "react";
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

  // Sync initial selection immediately when stem or initialIdx changes.
  // This avoids the "Render 1: new stem + old activeIdx" problem.
  const [syncedStem, setSyncedStem] = useState<string | null>(null);
  const [syncedInitialIdx, setSyncedInitialIdx] = useState<number | undefined>(undefined);

  if (stem !== syncedStem || initialIdx !== syncedInitialIdx) {
    setSyncedStem(stem);
    setSyncedInitialIdx(initialIdx);
  }

  const displayIdx = (stem !== syncedStem || (initialIdx !== undefined && initialIdx !== syncedInitialIdx)) 
    ? (initialIdx ?? 0) 
    : activeIdx;

  // Also keep the effect for safety/HMR
  useEffect(() => {
    if (initialIdx !== undefined) {
      setActiveIdx(initialIdx);
    }
  }, [initialIdx, stem, setActiveIdx]);

  // Sync local entries for the search panel
  const filtered = useMemo(() => {
    return data.entries
      .map((e, i) => ({ entry: e, idx: i }))
      .map(({ entry, idx }) => ({ entry: { ...entry, section: data.section }, idx }))
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
  const activeEntry = data.entries[displayIdx];
  useEffect(() => {
    setActivePandId(activeEntry?.pand_id ?? null);
  }, [activeEntry, setActivePandId]);

  return (
    <ScanPanel
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      stem={stem}
      page={data.page_number}
      section={data.section}
      entries={data.entries}
      activeEntry={activeEntry}
      activeIdx={displayIdx}
      prev={prev}
      next={next}
      editMode={editMode}
    />
  );
}
