"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Entry } from "@/lib/data";
import EditForm from "@/components/EditForm";

const BboxEditor = dynamic(() => import("@/components/BboxEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-bp-ink-dim" style={{ fontSize: 9 }}>
      Konva laden…
    </div>
  ),
});

interface Props {
  open: boolean;
  onClose: () => void;
  stem: string;
  page: number;
  activeEntry?: Entry;
  activeIdx?: number;
  prev?: string;
  next?: string;
  editMode?: boolean;
  wide?: boolean;
  focusMode?: boolean;
  onToggleFocus?: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const WHEEL_FACTOR = 1.0015;

export default function ScanPanel(p: Props) {
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [bboxEditMode, setBboxEditMode] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // Refs mirror state for handlers that need latest values without StrictMode
  // double-invocation issues from nested setState updaters.
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  // Base scale: cover container so paper background is never visible.
  const baseScale = useMemo(() => {
    if (!dim || !container.w || !container.h) return 1;
    return Math.max(container.w / dim.w, container.h / dim.h);
  }, [dim, container]);

  const dispW = dim ? dim.w * baseScale : 0;
  const dispH = dim ? dim.h * baseScale : 0;

  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      if (!container.w || !container.h || !dispW || !dispH) return { x: px, y: py };
      const minX = container.w - dispW * z;
      const minY = container.h - dispH * z;
      // displayed >= container, so minX/minY ≤ 0; max is 0.
      return {
        x: Math.min(0, Math.max(minX, px)),
        y: Math.min(0, Math.max(minY, py)),
      };
    },
    [container.w, container.h, dispW, dispH]
  );

  const centerPan = useCallback(
    (z: number) => ({ x: (container.w - dispW * z) / 2, y: (container.h - dispH * z) / 2 }),
    [container.w, container.h, dispW, dispH]
  );

  // Track container size
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const update = () => setContainer({ w: c.clientWidth, h: c.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // Reset on scan change. Handle cached image (onLoad may not fire).
  useEffect(() => {
    setDim(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBboxEditMode(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setDim({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }, [p.stem]);

  // When dim or container changes, re-center pan if it's at default (0,0).
  useEffect(() => {
    if (!dim || !container.w) return;
    if (panRef.current.x === 0 && panRef.current.y === 0 && zoomRef.current === 1) {
      setPan(centerPan(1));
    }
  }, [dim, container, centerPan]);

  // Auto-refocus when active entry changes: if its bbox isn't fully on-screen,
  // zoom out (only if needed) to fit, then pan to center it.
  const bboxKey = p.activeEntry?.entry_bbox?.join(",");
  useEffect(() => {
    const bb = p.activeEntry?.entry_bbox;
    if (!bb || !dim || !container.w || !container.h || !dispW || !dispH) return;
    const z = zoomRef.current;
    const pp = panRef.current;
    const sx = (n: number) => pp.x + (n / dim.w) * dispW * z;
    const sy = (n: number) => pp.y + (n / dim.h) * dispH * z;
    const left = sx(bb[0]);
    const top = sy(bb[1]);
    const right = sx(bb[2]);
    const bottom = sy(bb[3]);
    const visible =
      left >= 0 && top >= 0 && right <= container.w && bottom <= container.h;
    if (visible) return;

    // Width/height of bbox at zoom=1 (in container/displayed coords).
    const bbDispW = ((bb[2] - bb[0]) / dim.w) * dispW;
    const bbDispH = ((bb[3] - bb[1]) / dim.h) * dispH;
    // Zoom needed for bbox to occupy ≤ FILL of container.
    const FILL = 0.85;
    const zFit = Math.min(
      (container.w * FILL) / bbDispW,
      (container.h * FILL) / bbDispH
    );
    let newZoom = Math.min(z, zFit);
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    const cxImg = (bb[0] + bb[2]) / 2;
    const cyImg = (bb[1] + bb[3]) / 2;
    const targetX = container.w / 2 - (cxImg / dim.w) * dispW * newZoom;
    const targetY = container.h / 2 - (cyImg / dim.h) * dispH * newZoom;
    setPan(clampPan(targetX, targetY, newZoom));
    if (newZoom !== z) setZoom(newZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bboxKey, dim, container.w, container.h, dispW, dispH, clampPan]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan(centerPan(1));
  }, [centerPan]);

  const zoomBy = useCallback(
    (factor: number, originX?: number, originY?: number) => {
      const z = zoomRef.current;
      const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      if (nz === z) return;
      const c = containerRef.current;
      let newPan = panRef.current;
      if (c && originX !== undefined && originY !== undefined) {
        const r = c.getBoundingClientRect();
        const cx = originX - r.left;
        const cy = originY - r.top;
        const pp = panRef.current;
        const ix = (cx - pp.x) / z;
        const iy = (cy - pp.y) / z;
        newPan = { x: cx - ix * nz, y: cy - iy * nz };
      }
      newPan = clampPan(newPan.x, newPan.y, nz);
      setPan(newPan);
      setZoom(nz);
    },
    [clampPan]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = Math.pow(WHEEL_FACTOR, -e.deltaY);
      zoomBy(factor, e.clientX, e.clientY);
    },
    [zoomBy]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    const ds = dragStart.current;
    const next = clampPan(
      ds.px + (e.clientX - ds.mx),
      ds.py + (e.clientY - ds.my),
      zoomRef.current
    );
    setPan(next);
  };
  const stopDrag = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const bbox = p.activeEntry?.entry_bbox;
  const name = formatName(p.activeEntry);
  const occ = p.activeEntry?.occupation_expanded || p.activeEntry?.occupation || "";
  const addr = p.activeEntry?.address_full || "";
  const showBboxEditor =
    !!(p.editMode && p.activeEntry && p.activeIdx !== undefined && bboxEditMode);

  return (
    <div
      className="overflow-hidden border-l border-bp-ink/55 bg-bp-blue"
      style={{
        width: p.open ? (p.wide ? "100%" : 415) : 0,
        flex: p.wide ? "1 1 auto" : "0 0 auto",
        transition: "width 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <aside
        style={{ width: p.wide ? "100%" : 415 }}
        className="h-full flex flex-col"
      >
        <div
          className="flex items-center justify-between border-b border-bp-ink/55"
          style={{ padding: "5px 13px 4px" }}
        >
          <span
            className="text-bp-amber uppercase"
            style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
          >
            § 3 — Originele Scan
          </span>
          <div className="flex items-center gap-[10px]">
            {p.onToggleFocus && (
              <button
                type="button"
                onClick={p.onToggleFocus}
                className="uppercase"
                style={{
                  fontSize: 8,
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                  color: p.focusMode ? "#182d5c" : "#e8b84c",
                  background: p.focusMode ? "#e8b84c" : "transparent",
                  border: "1px solid #e8b84c88",
                  padding: "2px 8px",
                }}
                aria-pressed={!!p.focusMode}
                title="Verberg zoek- en kaartpaneel"
              >
                {p.focusMode ? "Smal" : "Focus"}
              </button>
            )}
            {p.editMode && p.activeEntry && p.activeIdx !== undefined && (
              <button
                type="button"
                onClick={() => setBboxEditMode((v) => !v)}
                className="uppercase"
                style={{
                  fontSize: 8,
                  letterSpacing: "0.14em",
                  fontWeight: 700,
                  color: bboxEditMode ? "#182d5c" : "#e8b84c",
                  background: bboxEditMode ? "#e8b84c" : "transparent",
                  border: "1px solid #e8b84c88",
                  padding: "2px 8px",
                }}
                aria-pressed={bboxEditMode}
              >
                {bboxEditMode ? "Bbox aan" : "Bewerk bbox"}
              </button>
            )}
            <button
              onClick={p.onClose}
              className="text-bp-ink-dim hover:text-bp-amber transition-colors"
              style={{ fontSize: 10 }}
              aria-label="Sluit scanpanel"
            >
              ✕
            </button>
          </div>
        </div>

        {!bboxEditMode && (
        <div className="flex flex-col gap-[4px]" style={{ padding: "9px 13px" }}>
          <span
            className="text-bp-ink-dim"
            style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.14em" }}
          >
            Alphabetisch Naamregister
          </span>
          <span
            className="text-bp-amber uppercase"
            style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em" }}
          >
            Pagina {p.page}
          </span>
          <div className="flex gap-[16px] mt-[3px]">
            <InfoCol label="Naam" value={name || "—"} />
            <InfoCol label="Beroep" value={occ || "—"} />
          </div>
          <div className="flex flex-col gap-[2px] mt-[2px]">
            <span
              className="text-bp-ink-dim uppercase"
              style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
            >
              Adres
            </span>
            <span
              className="text-bp-amber"
              style={{ fontSize: 10, letterSpacing: "0.1em" }}
            >
              {addr || "—"}
            </span>
          </div>
        </div>
        )}

        {p.editMode && p.activeEntry && p.activeIdx !== undefined && !bboxEditMode && (
          <EditForm
            stem={p.stem}
            idx={p.activeIdx}
            entry={p.activeEntry}
            onSaved={() => router.refresh()}
          />
        )}

        {showBboxEditor && p.activeEntry && p.activeIdx !== undefined && (
          <BboxEditor
            stem={p.stem}
            entryIdx={p.activeIdx}
            initialBbox={p.activeEntry.entry_bbox ?? null}
            onSaved={() => router.refresh()}
          />
        )}
        {!showBboxEditor && (
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden select-none"
          style={{
            background: "#1a1208",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onDoubleClick={reset}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: dispW || 0,
              height: dispH || 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              key={p.stem}
              src={`/scans/${p.stem}.jpg`}
              alt={`Scan ${p.stem}`}
              className="block pointer-events-none"
              draggable={false}
              style={{ width: "100%", height: "100%" }}
              onLoad={(e) => {
                const img = e.currentTarget;
                setDim({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
            {bbox && dim && (
              <div
                style={{
                  position: "absolute",
                  left: `${(bbox[0] / dim.w) * 100}%`,
                  top: `${(bbox[1] / dim.h) * 100}%`,
                  width: `${((bbox[2] - bbox[0]) / dim.w) * 100}%`,
                  height: `${((bbox[3] - bbox[1]) / dim.h) * 100}%`,
                  background: "#e8b84c44",
                  border: `${1 / zoom}px solid #e8b84c`,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          <div className="absolute flex flex-col gap-[2px]" style={{ right: 8, bottom: 8 }}>
            <ZoomBtn onClick={() => zoomBy(1.4)} label="+" />
            <ZoomBtn onClick={reset} label="⌖" small />
            <ZoomBtn onClick={() => zoomBy(1 / 1.4)} label="−" />
          </div>

          <div
            className="absolute uppercase"
            style={{
              left: 8,
              bottom: 8,
              fontSize: 8,
              letterSpacing: "0.12em",
              padding: "3px 6px",
              border: "1px solid #e8b84c55",
              background: "#182d5cee",
              color: "#7a7054",
            }}
          >
            Z {zoom.toFixed(1)}×
          </div>
        </div>
        )}

        <div
          className="flex items-center justify-between border-t border-bp-ink/55"
          style={{ padding: "8px 13px", fontSize: 9.5 }}
        >
          {p.prev ? (
            <Link
              href={`/page/${p.prev}`}
              className="text-bp-ink-dim hover:text-bp-amber transition-colors"
            >
              ← {p.page - 1}
            </Link>
          ) : (
            <span className="text-bp-ink-dim/40">←</span>
          )}
          <span
            className="text-bp-ink-bright uppercase"
            style={{ fontSize: 9, letterSpacing: "0.16em", fontWeight: 600 }}
          >
            Blz {p.page}
          </span>
          {p.next ? (
            <Link
              href={`/page/${p.next}`}
              className="text-bp-ink-dim hover:text-bp-amber transition-colors"
            >
              {p.page + 1} →
            </Link>
          ) : (
            <span className="text-bp-ink-dim/40">→</span>
          )}
        </div>
      </aside>
    </div>
  );
}

function ZoomBtn({
  onClick,
  label,
  small = false,
}: {
  onClick: () => void;
  label: string;
  small?: boolean;
}) {
  const size = small ? 22 : 26;
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center hover:bg-bp-amber/15"
      style={{
        width: size,
        height: size,
        border: "1px solid #e8b84c88",
        background: "#182d5cee",
        color: "#e8b84c",
        fontSize: 13,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );
}

function InfoCol({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[2px] flex-1 min-w-0">
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <span
        className="text-bp-ink-bright truncate"
        style={{ fontSize: 10, letterSpacing: "0.08em" }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function formatName(e?: Entry): string {
  if (!e) return "";
  const parts = [e.name, e.initials, e.name_prefix].filter(Boolean);
  return parts.join(" ");
}
