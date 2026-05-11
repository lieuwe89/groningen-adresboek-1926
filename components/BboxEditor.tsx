"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Bbox } from "@/lib/data";
import { useProxyUrl } from "@/lib/useProxyUrl";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrls";

interface Props {
  stem: string;
  entryIdx: number;
  initialBbox: Bbox | null;
  onSaved: () => void;
}

const MIN_RECT = 5;

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function BboxEditor(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);
  const contentSizeRef = useRef<{ w: number; h: number } | null>(null);
  const initRefocusedFor = useRef<string | null>(null);

  const [rect, setRect] = useState<Bbox | null>(p.initialBbox);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { prefix, proxyPath } = useProxyUrl();

  const tileSourceUrl = useCallback(
    (s: string) =>
      resolvePublicAssetUrl({
        assetPath: `/tiles/${s}.dzi`,
        proxyPrefix: prefix,
        cdnBaseUrl:
          process.env.NEXT_PUBLIC_TILES_BASE_URL ||
          process.env.NEXT_PUBLIC_STATIC_ASSETS_BASE_URL,
      }),
    [prefix]
  );

  const recalcOverlay = useCallback(() => {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const r = rectRef.current;
    const el = overlayRef.current;
    if (!el) return;
    if (!v || !OSD || !r || !contentSizeRef.current) {
      el.style.display = "none";
      return;
    }
    const tl = v.viewport.imageToViewerElementCoordinates(new OSD.Point(r[0], r[1]));
    const br = v.viewport.imageToViewerElementCoordinates(new OSD.Point(r[2], r[3]));
    el.style.display = "block";
    el.style.left = `${tl.x}px`;
    el.style.top = `${tl.y}px`;
    el.style.width = `${Math.max(0, br.x - tl.x)}px`;
    el.style.height = `${Math.max(0, br.y - tl.y)}px`;
  }, []);

  const autoRefocus = useCallback(() => {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const r = rectRef.current;
    const cs = contentSizeRef.current;
    if (!v || !OSD || !r || !cs) return;
    const key = `${p.stem}:${p.entryIdx}`;
    if (initRefocusedFor.current === key) return;
    initRefocusedFor.current = key;
    const w = r[2] - r[0];
    const h = r[3] - r[1];
    if (w <= 0 || h <= 0) return;
    const vrect = v.viewport.imageToViewportRectangle(r[0], r[1], w, h);
    const padX = vrect.width * 0.2;
    const padY = vrect.height * 0.2;
    v.viewport.fitBoundsWithConstraints(
      new OSD.Rect(
        vrect.x - padX,
        vrect.y - padY,
        vrect.width + 2 * padX,
        vrect.height + 2 * padY
      ),
      false
    );
  }, [p.stem, p.entryIdx]);

  // Init OSD once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const OSD = (await import("openseadragon")).default;
      if (cancelled || !containerRef.current) return;
      osdRef.current = OSD;
      const viewer = OSD({
        element: containerRef.current,
        showNavigationControl: false,
        showNavigator: false,
        immediateRender: false,
        animationTime: 0.35,
        blendTime: 0.08,
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 1,
        maxZoomPixelRatio: 4,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
        tileSources: tileSourceUrl(p.stem),
      });
      viewerRef.current = viewer;

      viewer.addHandler("open", () => {
        const item = viewer.world.getItemAt(0);
        if (!item) return;
        const sz = item.getContentSize();
        contentSizeRef.current = { w: sz.x, h: sz.y };
        recalcOverlay();
        autoRefocus();
      });
      viewer.addHandler("open-failed", (e: any) => {
        setError(e?.message || "scan kon niet geladen worden");
      });
      viewer.addHandler("update-viewport", () => {
        recalcOverlay();
        if (zoomLabelRef.current) {
          zoomLabelRef.current.textContent = viewer.viewport.getZoom(true).toFixed(1);
        }
      });
    })();
    return () => {
      cancelled = true;
      try {
        viewerRef.current?.destroy();
      } catch {
        // ignore
      }
      viewerRef.current = null;
      contentSizeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-open on stem change
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    contentSizeRef.current = null;
    setError(null);
    v.open(tileSourceUrl(p.stem));
  }, [p.stem, tileSourceUrl]);

  // Reset rect when entry/initial changes
  useEffect(() => {
    setRect(p.initialBbox);
    setDirty(false);
    setError(null);
  }, [p.initialBbox, p.entryIdx, p.stem]);

  // Recalc overlay when rect state changes
  useEffect(() => {
    recalcOverlay();
  }, [rect, recalcOverlay]);

  // Refocus on entry change (when OSD already open)
  useEffect(() => {
    if (!viewerRef.current || !contentSizeRef.current) return;
    autoRefocus();
  }, [p.entryIdx, p.stem, autoRefocus]);

  const beginDrag = useCallback((handle: Handle, startEvent: React.PointerEvent) => {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const r0 = rectRef.current;
    const cs = contentSizeRef.current;
    const container = containerRef.current;
    if (!v || !OSD || !r0 || !cs || !container) return;
    startEvent.preventDefault();
    startEvent.stopPropagation();

    const targetEl = startEvent.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(startEvent.pointerId);
    } catch {
      // ignore
    }
    v.setMouseNavEnabled(false);

    const containerRect = container.getBoundingClientRect();
    const toImagePt = (clientX: number, clientY: number) =>
      v.viewport.viewerElementToImageCoordinates(
        new OSD.Point(clientX - containerRect.left, clientY - containerRect.top)
      );

    const startImg = toImagePt(startEvent.clientX, startEvent.clientY);
    const initial: Bbox = [...r0] as Bbox;

    const onMove = (e: PointerEvent) => {
      const cur = toImagePt(e.clientX, e.clientY);
      const dx = cur.x - startImg.x;
      const dy = cur.y - startImg.y;
      let [x1, y1, x2, y2] = initial;
      if (handle === "move") {
        const w = x2 - x1;
        const h = y2 - y1;
        x1 = Math.max(0, Math.min(cs.w - w, x1 + dx));
        y1 = Math.max(0, Math.min(cs.h - h, y1 + dy));
        x2 = x1 + w;
        y2 = y1 + h;
      } else {
        if (handle.includes("w")) x1 = Math.max(0, Math.min(x2 - MIN_RECT, x1 + dx));
        if (handle.includes("e")) x2 = Math.min(cs.w, Math.max(x1 + MIN_RECT, x2 + dx));
        if (handle.includes("n")) y1 = Math.max(0, Math.min(y2 - MIN_RECT, y1 + dy));
        if (handle.includes("s")) y2 = Math.min(cs.h, Math.max(y1 + MIN_RECT, y2 + dy));
      }
      const next: Bbox = [
        Math.round(x1),
        Math.round(y1),
        Math.round(x2),
        Math.round(y2),
      ];
      rectRef.current = next;
      setRect(next);
    };

    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        targetEl.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      v.setMouseNavEnabled(true);
      setDirty(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);

  const onSave = async () => {
    if (!rect) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        proxyPath(`/api/admin/page/${p.stem}/entry/${p.entryIdx}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bbox: rect }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      setDirty(false);
      p.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const onRevert = () => {
    setRect(p.initialBbox);
    setDirty(false);
    setError(null);
  };

  const zoomBy = (factor: number) => {
    const v = viewerRef.current;
    if (!v) return;
    v.viewport.zoomBy(factor);
    v.viewport.applyConstraints();
  };
  const reset = () => viewerRef.current?.viewport.goHome();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        className="relative flex-1 overflow-hidden select-none"
        style={{ background: "#1a1208", touchAction: "none" }}
      >
        <div ref={containerRef} className="absolute inset-0" />

        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            display: "none",
            border: "1px solid #e8b84c",
            background: "#e8b84c33",
            cursor: "move",
            boxSizing: "border-box",
            zIndex: 4,
            touchAction: "none",
          }}
          onPointerDown={(e) => beginDrag("move", e)}
        >
          {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => (
            <div key={h} style={handleStyle(h)} onPointerDown={(e) => beginDrag(h, e)} />
          ))}
        </div>

        <div
          className="absolute flex flex-col gap-[2px]"
          style={{ right: 8, bottom: 8, zIndex: 5 }}
        >
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
            zIndex: 5,
          }}
        >
          Z <span ref={zoomLabelRef}>1.0</span>× · BBOX EDIT
        </div>
      </div>

      <div
        className="flex items-center justify-between border-t border-bp-ink/55"
        style={{ padding: "6px 13px", gap: 8 }}
      >
        <span
          className="text-bp-ink-dim uppercase"
          style={{
            fontSize: 7.5,
            letterSpacing: "0.14em",
            flex: 1,
            minWidth: 0,
          }}
          title={rect ? rect.join(", ") : ""}
        >
          {rect ? `${rect[0]},${rect[1]} – ${rect[2]},${rect[3]}` : "geen bbox"}
          {error && <span className="text-red-400 ml-2">· {error}</span>}
        </span>
        <button
          type="button"
          onClick={onRevert}
          disabled={!dirty || saving}
          className="uppercase disabled:opacity-30"
          style={{
            fontSize: 8,
            letterSpacing: "0.14em",
            fontWeight: 600,
            color: "#7a7054",
            padding: "4px 8px",
          }}
        >
          Terug
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving || !rect}
          className="uppercase disabled:opacity-30"
          style={{
            fontSize: 8,
            letterSpacing: "0.14em",
            fontWeight: 700,
            color: "#e8b84c",
            border: "1px solid #e8b84c88",
            background: dirty ? "#e8b84c12" : "transparent",
            padding: "4px 12px",
          }}
        >
          {saving ? "Bezig…" : "Opslaan bbox"}
        </button>
      </div>
    </div>
  );
}

function handleStyle(h: Exclude<Handle, "move">): CSSProperties {
  const s = 10;
  const off = -s / 2;
  const cursors: Record<Exclude<Handle, "move">, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
  };
  const base: CSSProperties = {
    position: "absolute",
    width: s,
    height: s,
    background: "#182d5c",
    border: "1.5px solid #e8b84c",
    boxSizing: "border-box",
    cursor: cursors[h],
    touchAction: "none",
  };
  if (h === "n") return { ...base, top: off, left: `calc(50% - ${s / 2}px)` };
  if (h === "s") return { ...base, bottom: off, left: `calc(50% - ${s / 2}px)` };
  if (h === "e") return { ...base, top: `calc(50% - ${s / 2}px)`, right: off };
  if (h === "w") return { ...base, top: `calc(50% - ${s / 2}px)`, left: off };
  if (h === "ne") return { ...base, top: off, right: off };
  if (h === "nw") return { ...base, top: off, left: off };
  if (h === "se") return { ...base, bottom: off, right: off };
  return { ...base, bottom: off, left: off }; // sw
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
