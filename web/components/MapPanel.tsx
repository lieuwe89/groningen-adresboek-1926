"use client";

interface Props {
  searchOpen: boolean;
  scanOpen: boolean;
  onOpenSearch: () => void;
  onOpenScan: () => void;
}

export default function MapPanel({ searchOpen, scanOpen, onOpenSearch, onOpenScan }: Props) {
  return (
    <section className="relative flex-1 min-w-0 overflow-hidden bg-bp-blue">
      {/* Placeholder map background — solid blueprint with grid + scale bar */}
      <div className="absolute inset-0">
        <BlueprintGrid />
        <ScaleBar />
      </div>

      {/* "Zoeken" floating button — visible only when search panel closed */}
      <button
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

      {/* "Scan" floating button — visible only when scan panel closed */}
      <button
        onClick={onOpenScan}
        className="absolute flex items-center gap-[6px] uppercase font-bold transition-opacity"
        style={{
          top: 14,
          right: 14,
          fontSize: 9,
          letterSpacing: "0.18em",
          padding: "7px 10px",
          border: "1px solid #e8b84c88",
          background: "#182d5cee",
          color: "#e8b84c",
          opacity: scanOpen ? 0 : 1,
          pointerEvents: scanOpen ? "none" : "auto",
          transition: "opacity 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        Scan
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8b84c" strokeWidth="2">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </button>

      {/* Map controls (right side) */}
      <div
        className="absolute flex flex-col gap-[2px]"
        style={{ right: 14, bottom: 14 }}
      >
        <MapBtn>+</MapBtn>
        <MapBtn small>⌖</MapBtn>
        <MapBtn>−</MapBtn>
      </div>

      {/* Layers panel (left side) */}
      <div
        className="absolute flex flex-col gap-[1px]"
        style={{ left: 14, bottom: 14, width: 180 }}
      >
        <div
          className="px-[10px] py-[5px] uppercase"
          style={{
            border: "1px solid #cfc39a44",
            background: "#182d5ccc",
            color: "#e8b84c",
            fontSize: 9,
            letterSpacing: "0.2em",
            fontWeight: 600,
          }}
        >
          Kaartlagen
        </div>
        <LayerRow id="historisch" label="1926 — Historisch" defaultOn locked />
        <LayerRow id="straten" label="Straten &amp; namen" defaultOn />
        <LayerRow id="adressen" label="Adresmarkeringen" defaultOn />
        <LayerRow id="modern" label="Modern overlay" />
      </div>

      {/* Centered placeholder note */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{
          fontFamily: "var(--font-hand)",
          color: "#cfc39a99",
          fontSize: 13,
          letterSpacing: "0.04em",
        }}
      >
        Plattegrond Groningen 1926
        <br />
        <span style={{ fontSize: 10, color: "#7a7054" }}>
          [ kaart en markers volgen — geocoderingspas in voorbereiding ]
        </span>
      </div>
    </section>
  );
}

function MapBtn({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  const size = small ? 22 : 28;
  return (
    <button
      style={{
        width: size,
        height: size,
        border: "1px solid #e8b84c88",
        background: "#182d5cee",
        color: "#e8b84c",
        fontSize: 13,
        lineHeight: 1,
      }}
      className="flex items-center justify-center hover:bg-bp-amber/15"
    >
      {children}
    </button>
  );
}

function LayerRow({
  label,
  defaultOn = false,
  locked = false,
}: {
  id: string;
  label: string;
  defaultOn?: boolean;
  locked?: boolean;
}) {
  // Foundation slice: visual only, no toggle wiring beyond useState
  return (
    <div
      className="flex items-center gap-[8px] uppercase"
      style={{
        fontSize: 8.5,
        letterSpacing: "0.12em",
        padding: "5px 10px",
        border: defaultOn ? "1px solid #e8b84c66" : "1px solid #cfc39a33",
        background: defaultOn ? "#e8b84c0d" : "#182d5cbb",
        color: defaultOn ? "#e6d9b0" : "#7a7054",
        opacity: locked ? 0.85 : 1,
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          border: "1px solid #e8b84c88",
          background: defaultOn ? "#e8b84c" : "transparent",
        }}
      />
      <span
        dangerouslySetInnerHTML={{ __html: label }}
        style={{ flex: 1 }}
      />
    </div>
  );
}

function BlueprintGrid() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="map-fine" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#cfc39a" strokeWidth="0.3" opacity="0.12" />
        </pattern>
        <pattern id="map-coarse" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#cfc39a" strokeWidth="0.7" opacity="0.16" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#map-fine)" />
      <rect width="100%" height="100%" fill="url(#map-coarse)" />
    </svg>
  );
}

function ScaleBar() {
  return (
    <div
      className="absolute flex items-center gap-[6px] text-bp-ink-dim uppercase"
      style={{ left: 14, top: 14, fontSize: 7, letterSpacing: "0.12em" }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: 18,
            height: 5,
            border: "1px solid #cfc39a55",
            background: i % 2 === 0 ? "#cfc39a55" : "transparent",
          }}
        />
      ))}
      <span style={{ marginLeft: 4 }}>0 — 500 M</span>
    </div>
  );
}
