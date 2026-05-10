"use client";

import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { useProxyUrl } from "@/lib/useProxyUrl";
import { formatEntryName, presentEntry } from "@/lib/entryPresentation";

type Mention = {
  stable_id: string;
  stem: string;
  page_number: number | null;
  section: string;
  name: string | null;
  initials: string | null;
  entity_type: string | null;
  role: string | null;
  parent_organization: string | null;
  description: string | null;
  occupation: string | null;
  address_full: string | null;
};

type Person = {
  cluster_id: string;
  canonical_name: string | null;
  canonical_occupation: string | null;
  canonical_address: string | null;
  mentions: Mention[];
};

type Detail = {
  pand_id: string;
  centroid: { lat: number; lng: number } | null;
  bbox: [number, number, number, number] | null;
  persons: Person[];
};

function buildingMentionLine(mention: Mention): string {
  const display = presentEntry(mention, mention.section);
  const detail = display.detail !== "-" ? display.detail : display.badge || "Vermelding";
  return [detail, display.address].filter(Boolean).join(" - ");
}

interface Props {
  pandId: string;
  onClose: () => void;
  onSelectEntry: (stem: string, stable_id: string) => void;
}

export default function BuildingPanel({ pandId, onClose, onSelectEntry }: Props) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('BuildingPanel');
  const { proxyPath } = useProxyUrl();

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    const ctrl = new AbortController();
    fetch(proxyPath(`/api/buildings/${encodeURIComponent(pandId)}`), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Detail) => setData(d))
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message ?? e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [pandId]);

  return (
    <div
      className="absolute z-30 flex flex-col"
      style={{
        top: 14,
        right: 56, // clear of NavigationControl
        width: 320,
        maxHeight: "calc(100% - 28px)",
        background: "#182d5cee",
        border: "1px solid #e8b84c66",
        color: "#e6d9b0",
        fontFamily: "monospace",
        fontSize: 11,
      }}
    >
      <div
        className="flex items-center justify-between px-[12px] py-[8px] uppercase"
        style={{
          borderBottom: "1px solid #cfc39a44",
          color: "#e8b84c",
          fontSize: 9,
          letterSpacing: "0.18em",
          fontWeight: 700,
        }}
      >
        <span>{t('title')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluit gebouwpaneel"
          style={{ background: "none", border: "none", color: "#e8b84c", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ padding: "8px 0" }}>
        {loading && (
          <div style={{ padding: "12px", color: "#7a7054", fontSize: 9 }}>{t('loading')}</div>
        )}
        {error && (
          <div style={{ padding: "12px", color: "#e89e3b", fontSize: 9 }}>{error}</div>
        )}
        {!loading && !error && data && data.persons.length === 0 && (
          <div style={{ padding: "12px", color: "#7a7054", fontSize: 9 }}>
            {t('noEntries')}
          </div>
        )}
        {!loading && !error && data &&
          data.persons.map((p) => {
            const firstDisplay = presentEntry(p.mentions[0], p.mentions[0].section);
            const headerName = p.canonical_name || formatEntryName(p.mentions[0]) || "—";
            const headerOcc = p.canonical_occupation || firstDisplay.subtitle || "";
            const headerAddr = p.canonical_address || firstDisplay.address || "";
            
            return (
              <div key={p.cluster_id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    padding: "4px 12px",
                    borderTop: "1px solid #cfc39a22",
                    borderBottom: "1px solid #cfc39a22",
                    background: "#0e1e44",
                    color: "#e8b84c",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      {firstDisplay.badge ? `${firstDisplay.badge}: ` : ""}
                      {headerName}
                    </span>
                    <span style={{ color: "#7a7054", fontSize: 9 }}>({p.mentions.length})</span>
                  </div>
                  {headerOcc && (
                    <span style={{ color: "#e6d9b0", fontSize: 9, fontWeight: 400 }}>{headerOcc}</span>
                  )}
                  {headerAddr && (
                    <span style={{ color: "#7a7054", fontSize: 9, fontWeight: 400 }}>{headerAddr}</span>
                  )}
                </div>
                {p.mentions.map((m) => (
                  <button
                    key={m.stable_id}
                    type="button"
                    onClick={() => onSelectEntry(m.stem, m.stable_id)}
                    className="w-full text-left flex flex-col"
                    style={{
                      padding: "6px 12px",
                      background: "transparent",
                      borderLeft: "2px solid transparent",
                      color: "#e6d9b0",
                      fontSize: 10,
                    }}
                    onMouseEnter={(ev) =>
                      (ev.currentTarget.style.background = "#e8b84c0c")
                    }
                    onMouseLeave={(ev) =>
                      (ev.currentTarget.style.background = "transparent")
                    }
                  >
                    <span style={{ color: "#7a7054", fontSize: 9 }}>
                      {buildingMentionLine(m)}
                    </span>
                    {m.page_number != null && (
                      <span style={{ color: "#7a7054", fontSize: 9 }}>{t('page')} {m.page_number}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
