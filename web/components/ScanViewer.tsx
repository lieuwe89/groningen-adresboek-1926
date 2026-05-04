"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface ScanViewerHandle {
  zoomBy: (factor: number) => void;
  reset: () => void;
}

interface Props {
  stem: string;
  bbox?: number[] | null;
}

const ScanViewer = forwardRef<ScanViewerHandle, Props>(function ScanViewer(
  { stem, bbox },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const osdRef = useRef<any>(null);
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const dimsRef = useRef<{ w: number; h: number } | null>(null);
  const bboxRef = useRef<number[] | null | undefined>(bbox);
  bboxRef.current = bbox;

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
        tileSources: `/tiles/${stem}.dzi`,
      });
      viewerRef.current = viewer;
      viewer.addHandler("canvas-double-click", (ev: any) => {
        ev.preventDefaultAction = true;
        viewer.viewport.goHome();
      });
      viewer.addHandler("open", () => {
        const item = viewer.world.getItemAt(0);
        if (!item) return;
        const sz = item.getContentSize();
        dimsRef.current = { w: sz.x, h: sz.y };
        applyBbox(bboxRef.current);
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
      overlayElRef.current = null;
      dimsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    dimsRef.current = null;
    overlayElRef.current = null;
    v.open(`/tiles/${stem}.dzi`);
  }, [stem]);

  const bboxKey = bbox ? bbox.join(",") : "";
  useEffect(() => {
    applyBbox(bbox ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bboxKey]);

  function applyBbox(bb: number[] | null | undefined) {
    const v = viewerRef.current;
    const OSD = osdRef.current;
    const dim = dimsRef.current;
    if (!v || !OSD || !dim) return;

    if (overlayElRef.current) {
      try {
        v.removeOverlay(overlayElRef.current);
      } catch {
        // ignore
      }
      overlayElRef.current = null;
    }
    if (!bb || bb.length < 4) return;
    const [x0, y0, x1, y1] = bb;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    const rect = v.viewport.imageToViewportRectangle(x0, y0, w, h);
    const el = document.createElement("div");
    el.style.cssText =
      "background:#e8b84c44;border:2px solid #e8b84c;pointer-events:none;box-sizing:border-box;";
    overlayElRef.current = el;
    v.addOverlay({ element: el, location: rect });

    const view = v.viewport.getBounds();
    const fits =
      rect.x >= view.x &&
      rect.y >= view.y &&
      rect.x + rect.width <= view.x + view.width &&
      rect.y + rect.height <= view.y + view.height;
    if (!fits) {
      const padX = rect.width * 0.2;
      const padY = rect.height * 0.2;
      const padded = new OSD.Rect(
        rect.x - padX,
        rect.y - padY,
        rect.width + 2 * padX,
        rect.height + 2 * padY
      );
      v.viewport.fitBoundsWithConstraints(padded, false);
    }
  }

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
