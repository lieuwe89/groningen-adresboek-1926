"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { Entry } from "@/lib/data";
import EditForm from "@/components/EditForm";
import type { ScanViewerHandle } from "@/components/ScanViewer";

const ScanViewer = dynamic(() => import("@/components/ScanViewer"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-bp-ink-dim" style={{ fontSize: 9 }}>
      Scan laden…
    </div>
  ),
});

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
  entries?: Entry[];
}

export default function ScanPanel(p: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerRef = useRef<ScanViewerHandle | null>(null);
  const [bboxEditMode, setBboxEditMode] = useState(false);

  function handleSelectEntry(idx: number) {
    const stableId = `${p.stem}:${idx}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("entry", stableId);
    router.push(`/page/${p.stem}?${params.toString()}`);
  }

  useEffect(() => {
    setBboxEditMode(false);
  }, [p.stem]);

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

        {p.editMode && (
          <div
            className="bg-[#e8b84c15] border-b border-[#e8b84c44] flex items-center justify-center py-[3px]"
            style={{ fontSize: 8, letterSpacing: "0.2em", fontWeight: 700, color: "#e8b84c" }}
          >
            ADMIN EDIT MODE
          </div>
        )}

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
            <div className="flex items-baseline justify-between">
              <span
                className="text-bp-ink-dim uppercase"
                style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
              >
                Adres
              </span>
              {p.activeEntry && !p.activeEntry.pand_id && (
                <span
                  className="text-bp-amber/50 italic"
                  style={{ fontSize: 7.5, letterSpacing: "0.05em" }}
                >
                  Locatie nog niet gelinkt
                </span>
              )}
            </div>
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
          <div className="relative flex-1 overflow-hidden">
            <ScanViewer
              ref={(h) => {
                viewerRef.current = h;
              }}
              stem={p.stem}
              entries={p.entries}
              activeIdx={p.activeIdx}
              onSelectEntry={handleSelectEntry}
            />

            <div className="absolute flex flex-col gap-[2px]" style={{ right: 8, bottom: 8, zIndex: 5 }}>
              <ZoomBtn onClick={() => viewerRef.current?.zoomBy(1.4)} label="+" />
              <ZoomBtn onClick={() => viewerRef.current?.reset()} label="⌖" small />
              <ZoomBtn onClick={() => viewerRef.current?.zoomBy(1 / 1.4)} label="−" />
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
