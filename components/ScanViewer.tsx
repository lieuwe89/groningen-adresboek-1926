"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useProxyUrl } from "@/lib/useProxyUrl";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrls";
import type { Entry } from "@/lib/data";

export interface ScanViewerHandle {
  zoomBy: (factor: number) => void;
  reset: () => void;
}

interface Props {
  stem: string;
  entries?: Entry[];
  activeIdx?: number;
  onSelectEntry?: (idx: number) => void;
}

const ScanViewer = forwardRef<ScanViewerHandle, Props>(function ScanViewer(
  { stem, entries, activeIdx, onSelectEntry },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);
  const dimsRef = useRef<{ w: number; h: number } | null>(null);
  const prevActiveIdxRef = useRef<number | undefined>(undefined);
  const lastFocusedStemRef = useRef<string | null>(null);
  const lastFocusedIdxRef = useRef<number | undefined>(undefined);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const stemRef = useRef(stem);
  stemRef.current = stem;
  const onSelectEntryRef = useRef(onSelectEntry);
  onSelectEntryRef.current = onSelectEntry;
  const { prefix } = useProxyUrl();

  const applyOverlaysRef = useRef<((force?: boolean) => void) | null>(null);

  const tileSourceUrl = (currentStem: string) =>
    resolvePublicAssetUrl({
      assetPath: `/tiles/${currentStem}.dzi`,
      proxyPrefix: prefix,
      cdnBaseUrl:
        process.env.NEXT_PUBLIC_TILES_BASE_URL ||
        process.env.NEXT_PUBLIC_STATIC_ASSETS_BASE_URL,
    });

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
        tileSources: tileSourceUrl(stem),
      });
      viewerRef.current = viewer;

      viewer.addHandler("canvas-double-click", (ev: any) => {
        ev.preventDefaultAction = true;
        viewer.viewport.goHome();
      });

      viewer.addHandler("canvas-click", (ev: any) => {
        if (!ev.quick) return;
        const v = viewerRef.current;
        const ents = entriesRef.current;
        if (!v || !ents) return;
        const imgPt = v.viewport.viewerElementToImageCoordinates(ev.position);
        const idx = ents.findIndex((e) => {
          const bb = e.entry_bbox;
          if (!bb) return false;
          return (
            imgPt.x >= bb[0] &&
            imgPt.x <= bb[2] &&
            imgPt.y >= bb[1] &&
            imgPt.y <= bb[3]
          );
        });
        if (idx >= 0) {
          onSelectEntryRef.current?.(idx);
        }
      });

      viewer.addHandler("open", () => {
        const item = viewer.world.getItemAt(0);
        if (!item) return;
        const sz = item.getContentSize();
        dimsRef.current = { w: sz.x, h: sz.y };
        applyOverlaysRef.current?.(true); // Force focus on open
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

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    dimsRef.current = null;
    v.open(tileSourceUrl(stem));
  }, [stem]);

  useEffect(() => {
    applyOverlays();
    prevActiveIdxRef.current = activeIdx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activeIdx]);

  function applyOverlays(forceFocus = false) {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const ents = entriesRef.current;
    const aidx = activeIdxRef.current;
    const curStem = stemRef.current;

    if (!v || !OSD || !ents) return;

    v.clearOverlays();

    ents.forEach((entry, i) => {
      const bb = entry.entry_bbox;
      if (!bb || bb.length < 4) return;
      const [x0, y0, x1, y1] = bb;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return;

      const rect = v.viewport.imageToViewportRectangle(x0, y0, w, h);
      const isActive = i === aidx;
      const canNavigateToAddress = !!entry.pand_id;
      const linkedBorder = isActive ? "2px solid #e8b84c" : "1px solid #e8b84c66";
      const linkedBackground = isActive ? "#e8b84c22" : "transparent";
      const unlinkedBorder = isActive ? "2px dashed #7a7054" : "1px dashed #7a705466";
      const unlinkedBackground = isActive ? "#cfc39a10" : "transparent";

      const el = document.createElement("div");
      el.setAttribute(
        "aria-label",
        canNavigateToAddress ? "Open gekoppeld adres" : "Geen gekoppeld adres"
      );
      el.title = canNavigateToAddress ? "Open gekoppeld adres" : "Geen gekoppeld adres";
      el.style.cssText = `
        position: relative;
        box-sizing: border-box;
        cursor: pointer;
        pointer-events: auto;
        transition: background 120ms, border 120ms;
        border: ${canNavigateToAddress ? linkedBorder : unlinkedBorder};
        background: ${canNavigateToAddress ? linkedBackground : unlinkedBackground};
      `;

      const label = document.createElement("span");
      label.textContent = canNavigateToAddress ? "🔗 adres gekoppeld" : "⛓︎ adres niet gekoppeld";
      label.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        transform: translateY(-100%);
        font-size: 9px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px 3px 0 3px;
        background: ${canNavigateToAddress ? "#e8b84cee" : "#7a7054cc"};
        color: ${canNavigateToAddress ? "#1a1006" : "#f0ead8"};
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms;
        white-space: nowrap;
        font-family: sans-serif;
        font-weight: 600;
        letter-spacing: 0.02em;
      `;
      el.appendChild(label);

      el.addEventListener("mouseenter", () => {
        label.style.opacity = "1";
        if (!isActive) {
          el.style.background = canNavigateToAddress ? "#e8b84c18" : "#cfc39a0c";
          el.style.border = canNavigateToAddress ? "1px solid #e8b84c99" : "1px dashed #7a705499";
        }
      });
      el.addEventListener("mouseleave", () => {
        label.style.opacity = "0";
        if (!isActive) {
          el.style.background = "transparent";
          el.style.border = canNavigateToAddress ? "1px solid #e8b84c66" : "1px dashed #7a705466";
        }
      });
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelectEntryRef.current?.(i);
      });

      v.addOverlay({ element: el, location: rect });
      
      const isNewSelection = i !== lastFocusedIdxRef.current || curStem !== lastFocusedStemRef.current;

      if (isActive && (forceFocus || isNewSelection)) {
        const view = v.viewport.getBounds();
        const fits =
          rect.x >= view.x &&
          rect.y >= view.y &&
          rect.x + rect.width <= view.x + view.width &&
          rect.y + rect.height <= view.y + view.height;
        
        // Always focus if forced or if it doesn't fit
        if (!fits || forceFocus) {
          const padX = rect.width * 0.2;
          const padY = rect.height * 0.2;
          const padded = new OSD.Rect(
            rect.x - padX,
            rect.y - padY,
            rect.width + 2 * padX,
            rect.height + 2 * padY
          );
          v.viewport.fitBoundsWithConstraints(padded, false);
          
          lastFocusedIdxRef.current = i;
          lastFocusedStemRef.current = curStem;
        }
      }
    });
  }
  applyOverlaysRef.current = applyOverlays;

  useImperativeHandle(ref, () => ({
    zoomBy: (factor: number) => {
      const v = viewerRef.current;
      if (!v) return;
      v.viewport.zoomBy(factor);
      v.viewport.applyConstraints();
    },
    reset: () => {
      viewerRef.current?.viewport.goHome();
    },
  }));

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ background: "#1a1208", touchAction: "none" }}
    />
  );
});

export default ScanViewer;
