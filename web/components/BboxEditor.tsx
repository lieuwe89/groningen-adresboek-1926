"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import type { Bbox } from "@/lib/data";

interface Props {
  stem: string;
  entryIdx: number;
  initialBbox: Bbox | null;
  onSaved: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const SCALE_BY = 1.0015; // wheel
const MIN_RECT = 5; // image-coord pixels

export default function BboxEditor(p: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [rect, setRect] = useState<Bbox | null>(p.initialBbox);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRefocusedFor = useRef<string | null>(null);

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

  // Load scan
  useEffect(() => {
    setImg(null);
    setDim(null);
    const im = new window.Image();
    im.src = `/scans/${p.stem}.jpg`;
    im.onload = () => {
      setImg(im);
      setDim({ w: im.naturalWidth, h: im.naturalHeight });
    };
  }, [p.stem]);

  // Reset rect when entry/initial changes
  useEffect(() => {
    setRect(p.initialBbox);
    setDirty(false);
    setError(null);
  }, [p.initialBbox, p.entryIdx, p.stem]);

  // Cover-fit base scale (paper bg never visible)
  const baseScale = useMemo(() => {
    if (!dim || !container.w || !container.h) return 1;
    return Math.max(container.w / dim.w, container.h / dim.h);
  }, [dim, container]);

  const dispW = dim ? dim.w * baseScale : 0;
  const dispH = dim ? dim.h * baseScale : 0;

  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      if (!container.w || !dispW) return { x: px, y: py };
      const minX = container.w - dispW * z;
      const minY = container.h - dispH * z;
      return {
        x: Math.min(0, Math.max(minX, px)),
        y: Math.min(0, Math.max(minY, py)),
      };
    },
    [container.w, container.h, dispW, dispH]
  );

  // Center on first sizing
  useEffect(() => {
    if (!container.w || !dispW) return;
    setStagePos((cur) =>
      cur.x === 0 && cur.y === 0
        ? { x: (container.w - dispW) / 2, y: (container.h - dispH) / 2 }
        : cur
    );
  }, [container.w, container.h, dispW, dispH]);

  // Auto-refocus on entry change if rect not visible
  useEffect(() => {
    if (!rect || !dim || !container.w || !dispW) return;
    const key = `${p.stem}:${p.entryIdx}`;
    if (initRefocusedFor.current === key) return;
    initRefocusedFor.current = key;

    const z = stageScale;
    const pp = stagePos;
    const sx = (n: number) => pp.x + n * baseScale * z;
    const sy = (n: number) => pp.y + n * baseScale * z;
    const left = sx(rect[0]);
    const top = sy(rect[1]);
    const right = sx(rect[2]);
    const bottom = sy(rect[3]);
    const visible =
      left >= 0 && top >= 0 && right <= container.w && bottom <= container.h;
    if (visible) return;

    const bbDispW = (rect[2] - rect[0]) * baseScale;
    const bbDispH = (rect[3] - rect[1]) * baseScale;
    const FILL = 0.7;
    const zFit = Math.min(
      (container.w * FILL) / bbDispW,
      (container.h * FILL) / bbDispH
    );
    let newZoom = Math.min(z, zFit);
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    const cx = (rect[0] + rect[2]) / 2;
    const cy = (rect[1] + rect[3]) / 2;
    const tx = container.w / 2 - cx * baseScale * newZoom;
    const ty = container.h / 2 - cy * baseScale * newZoom;
    setStagePos(clampPan(tx, ty, newZoom));
    setStageScale(newZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.stem, p.entryIdx, dim, container.w, container.h, dispW, dispH, baseScale]);

  // Attach transformer to rect node when rect ready
  useEffect(() => {
    if (rect && rectRef.current && trRef.current && img) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [rect, img]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = stageScale;
    const factor = Math.pow(SCALE_BY, -e.evt.deltaY);
    let newScale = oldScale * factor;
    newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
    if (newScale === oldScale) return;
    const ix = (pointer.x - stagePos.x) / oldScale;
    const iy = (pointer.y - stagePos.y) / oldScale;
    const np = clampPan(pointer.x - ix * newScale, pointer.y - iy * newScale, newScale);
    setStageScale(newScale);
    setStagePos(np);
  };

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== stageRef.current) return;
    const np = clampPan(e.target.x(), e.target.y(), stageScale);
    setStagePos(np);
    e.target.position(np);
  };

  // Constrain stage drag in real-time
  const stageDragBound = useCallback(
    (pos: { x: number; y: number }) => clampPan(pos.x, pos.y, stageScale),
    [clampPan, stageScale]
  );

  const onRectTransformEnd = () => {
    const node = rectRef.current;
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const w = Math.max(MIN_RECT, node.width() * sx);
    const h = Math.max(MIN_RECT, node.height() * sy);
    node.width(w);
    node.height(h);
    commitRectFromNode();
  };

  const onRectDragEnd = () => commitRectFromNode();

  const commitRectFromNode = () => {
    const node = rectRef.current;
    if (!node || !dim) return;
    const x1 = Math.max(0, node.x() / baseScale);
    const y1 = Math.max(0, node.y() / baseScale);
    const x2 = Math.min(dim.w, (node.x() + node.width()) / baseScale);
    const y2 = Math.min(dim.h, (node.y() + node.height()) / baseScale);
    if (x2 - x1 < MIN_RECT || y2 - y1 < MIN_RECT) return;
    setRect([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]);
    setDirty(true);
  };

  // Bound drag of rect inside image
  const rectDragBound = useCallback(
    (pos: { x: number; y: number }) => {
      const node = rectRef.current;
      if (!node || !dim) return pos;
      const w = node.width();
      const h = node.height();
      return {
        x: Math.min(dispW - w, Math.max(0, pos.x)),
        y: Math.min(dispH - h, Math.max(0, pos.y)),
      };
    },
    [dim, dispW, dispH]
  );

  const onSave = async () => {
    if (!rect) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/page/${p.stem}/entry/${p.entryIdx}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbox: rect }),
      });
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

  const reset = () => {
    if (!container.w || !dispW) return;
    setStageScale(1);
    setStagePos({ x: (container.w - dispW) / 2, y: (container.h - dispH) / 2 });
  };

  const zoomBy = (factor: number) => {
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, stageScale * factor));
    if (newScale === stageScale) return;
    const cx = container.w / 2;
    const cy = container.h / 2;
    const ix = (cx - stagePos.x) / stageScale;
    const iy = (cy - stagePos.y) / stageScale;
    const np = clampPan(cx - ix * newScale, cy - iy * newScale, newScale);
    setStageScale(newScale);
    setStagePos(np);
  };

  const rectStage = rect
    ? {
        x: rect[0] * baseScale,
        y: rect[1] * baseScale,
        width: (rect[2] - rect[0]) * baseScale,
        height: (rect[3] - rect[1]) * baseScale,
      }
    : null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden select-none"
        style={{ background: "#1a1208", touchAction: "none" }}
      >
        {img && container.w > 0 && (
          <Stage
            ref={stageRef}
            width={container.w}
            height={container.h}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable
            dragBoundFunc={stageDragBound}
            onDragEnd={onStageDragEnd}
            onWheel={onWheel}
            onDblClick={(e) => {
              if (e.target === stageRef.current) reset();
            }}
          >
            <Layer listening={false}>
              <KImage image={img} width={dispW} height={dispH} />
            </Layer>
            <Layer>
              {rectStage && (
                <>
                  <Rect
                    ref={rectRef}
                    x={rectStage.x}
                    y={rectStage.y}
                    width={rectStage.width}
                    height={rectStage.height}
                    fill="#e8b84c33"
                    stroke="#e8b84c"
                    strokeWidth={1 / stageScale}
                    strokeScaleEnabled={false}
                    draggable
                    dragBoundFunc={rectDragBound}
                    onDragEnd={onRectDragEnd}
                    onTransformEnd={onRectTransformEnd}
                  />
                  <Transformer
                    ref={trRef}
                    rotateEnabled={false}
                    flipEnabled={false}
                    keepRatio={false}
                    anchorSize={10 / stageScale}
                    anchorStrokeWidth={1 / stageScale}
                    borderStrokeWidth={1 / stageScale}
                    anchorStroke="#e8b84c"
                    anchorFill="#182d5c"
                    borderStroke="#e8b84cbb"
                    boundBoxFunc={(_oldBox, newBox) => {
                      if (newBox.width < MIN_RECT * baseScale) return _oldBox;
                      if (newBox.height < MIN_RECT * baseScale) return _oldBox;
                      return newBox;
                    }}
                  />
                </>
              )}
            </Layer>
          </Stage>
        )}

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
          Z {stageScale.toFixed(1)}× · BBOX EDIT
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
