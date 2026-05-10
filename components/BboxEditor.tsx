"use client";

import { useEffect, useRef, useState } from "react";
import type { Bbox } from "@/lib/data";
import { useProxyUrl } from "@/lib/useProxyUrl";

interface Props {
  stem: string;
  entryIdx: number;
  initialBbox: Bbox | null;
  onSaved: () => void;
}

const MIN_RECT = 5; // image-coord pixels
const HANDLE_SIZE = 10; // px in screen space

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

export default function BboxEditor(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);
  const dimsRef = useRef<{ w: number; h: number } | null>(null);

  const [rect, setRect] = useState<Bbox | null>(p.initialBbox);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState(1);
  const { proxyPath } = useProxyUrl();

  const tilesBase = proxyPath("");
  const refocusedFor = useRef<string | null>(null);
  const rectRef = useRef<Bbox | null>(p.initialBbox);
  rectRef.current = rect;

  // Init OSD viewer
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
        animationTime: 0.2,
        blendTime: 0.05,
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 1,
        maxZoomPixelRatio: 4,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
        tileSources: `${tilesBase}/tiles/${p.stem}.dzi`,
      });
      viewerRef.current = viewer;

      viewer.addHandler("open", () => {
        const item = viewer.world.getItemAt(0);
        if (!item) return;
        const sz = item.getContentSize();
        dimsRef.current = { w: sz.x, h: sz.y };
        focusOnRect(true);
        renderOverlay();
      });

      viewer.addHandler("animation", () => {
        renderOverlay();
        setZoomDisplay(viewer.viewport.getZoom(true));
      });
      viewer.addHandler("update-viewport", renderOverlay);
      viewer.addHandler("resize", renderOverlay);

      viewer.addHandler("canvas-double-click", (ev: any) => {
        ev.preventDefaultAction = true;
        viewer.viewport.goHome();
      });

      // Drawing new rect when none exists
      viewer.addHandler("canvas-drag", (ev: any) => {
        // handled by overlay element; nothing here
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
      dimsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload on stem/entry change
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    dimsRef.current = null;
    refocusedFor.current = null;
    v.open(`${tilesBase}/tiles/${p.stem}.dzi`);
  }, [p.stem, tilesBase]);

  // Reset rect when initial changes
  useEffect(() => {
    setRect(p.initialBbox);
    setDirty(false);
    setError(null);
    refocusedFor.current = null;
  }, [p.initialBbox, p.entryIdx, p.stem]);

  useEffect(() => {
    renderOverlay();
    focusOnRect(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect]);

  function focusOnRect(force: boolean) {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const r = rectRef.current;
    if (!v || !OSD || !r || !dimsRef.current) return;
    const key = `${p.stem}:${p.entryIdx}`;
    if (!force && refocusedFor.current === key) return;
    refocusedFor.current = key;

    const [x0, y0, x1, y1] = r;
    const w = x1 - x0;
    const h = y1 - y0;
    const padX = w * 0.4;
    const padY = h * 0.4;
    const vp = v.viewport.imageToViewportRectangle(
      x0 - padX,
      y0 - padY,
      w + 2 * padX,
      h + 2 * padY
    );
    v.viewport.fitBoundsWithConstraints(vp, false);
  }

  function renderOverlay() {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const r = rectRef.current;
    if (!v || !OSD) return;

    v.clearOverlays();
    if (!r) return;
    const [x0, y0, x1, y1] = r;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    const vpRect = v.viewport.imageToViewportRectangle(x0, y0, w, h);

    const el = document.createElement("div");
    el.style.cssText = `
      box-sizing: border-box;
      border: 1.5px solid #e8b84c;
      background: #e8b84c22;
      cursor: move;
      pointer-events: auto;
      position: relative;
    `;

    // Drag body
    attachDragHandlers(el, "move");

    // Resize handles
    const handles: Handle[] = ["nw", "ne", "sw", "se", "n", "s", "w", "e"];
    handles.forEach((h) => {
      const hEl = document.createElement("div");
      hEl.style.cssText = handleStyle(h);
      attachDragHandlers(hEl, h);
      el.appendChild(hEl);
    });

    v.addOverlay({ element: el, location: vpRect });
  }

  function attachDragHandlers(
    el: HTMLDivElement,
    mode: Handle | "move"
  ) {
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const v = viewerRef.current;
      const dim = dimsRef.current;
      if (!v || !dim) return;

      el.setPointerCapture(ev.pointerId);
      const startImg = v.viewport.viewerElementToImageCoordinates(
        new (osdRef.current.Point)(
          ev.clientX - v.element.getBoundingClientRect().left,
          ev.clientY - v.element.getBoundingClientRect().top
        )
      );
      const start: Bbox = rectRef.current
        ? ([...rectRef.current] as Bbox)
        : [0, 0, 0, 0];
      // Disable OSD panning during drag
      v.setMouseNavEnabled(false);

      const onMove = (mev: PointerEvent) => {
        const cur = v.viewport.viewerElementToImageCoordinates(
          new (osdRef.current.Point)(
            mev.clientX - v.element.getBoundingClientRect().left,
            mev.clientY - v.element.getBoundingClientRect().top
          )
        );
        const dx = cur.x - startImg.x;
        const dy = cur.y - startImg.y;

        let [x0, y0, x1, y1] = start;
        if (mode === "move") {
          const w = x1 - x0;
          const h = y1 - y0;
          x0 = clamp(x0 + dx, 0, dim.w - w);
          y0 = clamp(y0 + dy, 0, dim.h - h);
          x1 = x0 + w;
          y1 = y0 + h;
        } else {
          if (mode.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN_RECT);
          if (mode.includes("e")) x1 = clamp(x1 + dx, x0 + MIN_RECT, dim.w);
          if (mode.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN_RECT);
          if (mode.includes("s")) y1 = clamp(y1 + dy, y0 + MIN_RECT, dim.h);
        }
        const next: Bbox = [
          Math.round(x0),
          Math.round(y0),
          Math.round(x1),
          Math.round(y1),
        ];
        rectRef.current = next;
        setRect(next);
        setDirty(true);
      };

      const onUp = (uev: PointerEvent) => {
        try {
          el.releasePointerCapture(uev.pointerId);
        } catch {
          // ignore
        }
        v.setMouseNavEnabled(true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

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
      <div className="relative flex-1 overflow-hidden select-none" style={{ background: "#1a1208", touchAction: "none" }}>
        <div ref={containerRef} className="absolute inset-0" />

        <div className="absolute flex flex-col gap-[2px]" style={{ right: 8, bottom: 8, zIndex: 5 }}>
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
          Z {zoomDisplay.toFixed(1)}× · BBOX EDIT
        </div>
      </div>

      <div
        className="flex items-center justify-between border-t border-bp-ink/55"
        style={{ padding: "6px 13px", gap: 8 }}
      >
        <span
          className="text-bp-ink-dim uppercase"
          style={{ fontSize: 7.5, letterSpacing: "0.14em", flex: 1, minWidth: 0 }}
          title={rect ? rect.join(", ") : ""}
        >
          {rect
            ? `${rect[0]},${rect[1]} – ${rect[2]},${rect[3]}`
            : "geen bbox"}
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

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function handleStyle(h: Handle): string {
  const base = `position: absolute; width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px; background: #182d5c; border: 1.5px solid #e8b84c; box-sizing: border-box;`;
  const off = -HANDLE_SIZE / 2;
  switch (h) {
    case "nw": return `${base} left: ${off}px; top: ${off}px; cursor: nwse-resize;`;
    case "ne": return `${base} right: ${off}px; top: ${off}px; cursor: nesw-resize;`;
    case "sw": return `${base} left: ${off}px; bottom: ${off}px; cursor: nesw-resize;`;
    case "se": return `${base} right: ${off}px; bottom: ${off}px; cursor: nwse-resize;`;
    case "n":  return `${base} left: 50%; top: ${off}px; margin-left: ${off}px; cursor: ns-resize;`;
    case "s":  return `${base} left: 50%; bottom: ${off}px; margin-left: ${off}px; cursor: ns-resize;`;
    case "w":  return `${base} left: ${off}px; top: 50%; margin-top: ${off}px; cursor: ew-resize;`;
    case "e":  return `${base} right: ${off}px; top: 50%; margin-top: ${off}px; cursor: ew-resize;`;
  }
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
