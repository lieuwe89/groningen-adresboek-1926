"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { PersonHit } from "@/lib/searchTypes";

interface SelectionContextType {
  activePandId: string | null;
  setActivePandId: (id: string | null) => void;
  query: string;
  setQuery: (q: string) => void;
  fuzzy: boolean;
  setFuzzy: (f: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  scanOpen: boolean;
  setScanOpen: (open: boolean) => void;
  globalResults: PersonHit[];
  setGlobalResults: (results: PersonHit[]) => void;
  globalTotal: number;
  setGlobalTotal: (total: number) => void;
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;
  globalError: string | null;
  setGlobalError: (err: string | null) => void;
  filter: string;
  setFilter: (f: string) => void;
  localEntries: { entry: any; idx: number }[];
  setLocalEntries: (entries: { entry: any; idx: number }[]) => void;
  activeIdx: number;
  setActiveIdx: (idx: number) => void;
  onSelectLocal: (idx: number) => void;
  setOnSelectLocal: (fn: (idx: number) => void) => void;
  layersOpen: boolean;
  setLayersOpen: (open: boolean) => void;
  tourActive: boolean;
  setTourActive: (active: boolean) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [activePandId, setActivePandId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fuzzy, setFuzzy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [scanOpen, setScanOpen] = useState(true);
  const [globalResults, setGlobalResults] = useState<PersonHit[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [localEntries, setLocalEntries] = useState<{ entry: any; idx: number }[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [onSelectLocal, setOnSelectLocal] = useState<(idx: number) => void>(() => {});
  const [layersOpen, setLayersOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);

  return (
    <SelectionContext.Provider
      value={{
        activePandId,
        setActivePandId,
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
        setLocalEntries,
        activeIdx,
        setActiveIdx,
        onSelectLocal,
        setOnSelectLocal,
        layersOpen,
        setLayersOpen,
        tourActive,
        setTourActive,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
