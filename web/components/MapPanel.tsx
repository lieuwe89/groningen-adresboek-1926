"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import BuildingPanel from "./BuildingPanel";
import { HISTORIC_MAPS } from "@/lib/historicMaps";
import { useSelection } from "@/lib/SelectionContext";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface Props {
  searchOpen: boolean;
  scanOpen: boolean;
  onOpenSearch: () => void;
  onOpenScan: () => void;
  focusPandId: string | null;
}

export default function MapPanel({ searchOpen, scanOpen, onOpenSearch, onOpenScan, focusPandId }: Props) {
  const [buildingsOn, setBuildingsOn] = useState(true);
  const [historicId, setHistoricId] = useState<string | null>(null);
  const [historicOpacity, setHistoricOpacity] = useState(0.85);
  const [activePand, setActivePand] = useState<string | null>(null);
  const { layersOpen: layersExpanded, setLayersOpen: setLayersExpanded, tourActive } = useSelection();
  const router = useRouter();

  return (
    <section id="tour-map" className="relative flex-1 min-w-0 overflow-hidden bg-bp-blue">
      <MapView
        buildingsVisible={buildingsOn}
        historicId={historicId}
        historicOpacity={historicOpacity}
        onBuildingClick={setActivePand}
        focusPandId={focusPandId}
      />

      {activePand && (
        <BuildingPanel
          pandId={activePand}
          onClose={() => setActivePand(null)}
          onSelectEntry={(stem, stableId) => {
            const params = new URLSearchParams({ entry: stableId });
            router.push(`/page/${stem}?${params.toString()}`);
          }}
        />
      )}

      {/* "Zoeken" floating button — visible only when search panel closed */}
      <button
        id="tour-search"
        onClick={onOpenSearch}
        className="absolute flex items-center gap-[6px] uppercase font-bold transition-opacity"
        style={{
          top: 14,
          left: 14,
          fontSize: 9,
          letterSpacing: "0.18em",
          padding: "7px 10px",
          border: "1px solid #e8b84c88",
          background: "#182d5cee",
          color: "#e8b84c",
          opacity: searchOpen ? 0 : 1,
          pointerEvents: searchOpen ? "none" : "auto",
          transition: "opacity 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8b84c" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Zoeken
      </button>

      {/* "Scan" floating button — visible only when scan panel closed and no building popup */}
      <button
        id="tour-scan"
        onClick={onOpenScan}
        className="absolute flex items-center gap-[6px] uppercase font-bold transition-opacity"
        style={{
          top: 84,
          right: 14,
          fontSize: 9,
          letterSpacing: "0.18em",
          padding: "7px 10px",
          border: "1px solid #e8b84c88",
          background: "#182d5cee",
          color: "#e8b84c",
          opacity: scanOpen || activePand ? 0 : 1,
          pointerEvents: scanOpen || activePand ? "none" : "auto",
          transition: "opacity 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        Scan
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8b84c" strokeWidth="2">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </button>

      {/* Layers panel (left side) */}
      <div
        id="tour-layers-panel"
        className="absolute flex flex-col gap-[1px]"
        style={{
          left: 14,
          bottom: 14,
          width: 260,
          transition: "transform 200ms ease",
        }}
        onMouseEnter={() => setLayersExpanded(true)}
        onMouseLeave={() => {
          if (!tourActive) setLayersExpanded(false);
        }}
      >
        <button
          id="tour-layers"
          onClick={() => setLayersExpanded(!layersExpanded)}
          className="flex items-center justify-between px-[10px] py-[8px] uppercase w-full group"
          style={{
            border: "1px solid #cfc39a55",
            background: "#12234dee",
            color: "#e8b84c",
            fontSize: 9.5,
            letterSpacing: "0.22em",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          <span>Kaartlagen</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            style={{
              transition: "transform 200ms",
              transform: layersExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Collapsible area */}
        <div
          className="flex flex-col gap-[1px] transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            maxHeight: layersExpanded ? 500 : 0,
            opacity: layersExpanded ? 1 : 0,
            pointerEvents: layersExpanded ? "auto" : "none",
          }}
        >
          <LayerRow
            label="Modern (geen overlay)"
            on={historicId === null}
            onChange={() => setHistoricId(null)}
            radio
          />
          {HISTORIC_MAPS.map((m) => (
            <LayerRow
              key={m.id}
              label={m.label}
              on={historicId === m.id}
              onChange={() => setHistoricId(m.id)}
              radio
            />
          ))}

          {historicId && (
            <div
              className="flex items-center gap-[10px]"
              style={{
                padding: "8px 12px",
                border: "1px solid #cfc39a44",
                background: "#12234def",
                fontSize: 8.5,
                letterSpacing: "0.1em",
                color: "#cfc39a",
              }}
            >
              <span className="uppercase" style={{ minWidth: 84, fontWeight: 700 }}>Transparantie</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(historicOpacity * 100)}
                onChange={(e) => setHistoricOpacity(Number(e.target.value) / 100)}
                style={{
                  flex: 1,
                  height: 2,
                  accentColor: "#e8b84c",
                  cursor: "pointer",
                  margin: "0 4px",
                }}
                aria-label="Transparantie historische kaart"
              />
              <span style={{ minWidth: 32, textAlign: "right" }}>
                {Math.round(historicOpacity * 100)}%
              </span>
            </div>
          )}

          <LayerRow label="Adresgebouwen" on={buildingsOn} onChange={setBuildingsOn} />
        </div>
      </div>
    </section>
  );
}

function LayerRow({
  label,
  on,
  onChange,
  radio = false,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  radio?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-[8px] uppercase text-left"
      style={{
        fontSize: 9,
        letterSpacing: "0.14em",
        fontWeight: on ? 700 : 600,
        padding: "6px 10px",
        border: on ? "1px solid #e8b84c77" : "1px solid #cfc39a44",
        background: on ? "#e8b84c1a" : "#12234def",
        color: on ? "#f0e6c8" : "#948a6a",
        cursor: "pointer",
      }}
      onClick={() => onChange(!on)}
    >
      <span
        style={{
          width: 9,
          height: 9,
          border: "1px solid #e8b84c99",
          background: on ? "#e8b84c" : "transparent",
          borderRadius: radio ? "50%" : 0,
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
