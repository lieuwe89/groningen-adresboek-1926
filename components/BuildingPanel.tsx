"use client";

import { useEffect, useState } from "react";
import { useTranslations } from 'next-intl';
import { useProxyUrl } from "@/lib/useProxyUrl";

type Entry = {
  stable_id: string;
  stem: string;
  page_number: number | null;
  name: string | null;
  initials: string | null;
  occupation: string | null;
  address_full: string | null;
};

type Detail = {
  pand_id: string;
  centroid: { lat: number; lng: number } | null;
  bbox: [number, number, number, number] | null;
  addresses: Array<{ address_full: string; entries: Entry[] }>;
};

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
        {!loading && !error && data && data.addresses.length === 0 && (
          <div style={{ padding: "12px", color: "#7a7054", fontSize: 9 }}>
            {t('noEntries')}
          </div>
        )}
        {!loading && !error && data &&
          data.addresses.map((g) => (
            <div key={g.address_full} style={{ marginBottom: 8 }}>
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
                }}
              >
                {g.address_full || "—"}{" "}
                <span style={{ color: "#7a7054", fontSize: 9 }}>
                  ({g.entries.length})
                </span>
              </div>
              {g.entries.map((e) => (
                <button
                  key={e.stable_id}
                  type="button"
                  onClick={() => onSelectEntry(e.stem, e.stable_id)}
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
                  <span style={{ fontWeight: 700 }}>
                    {[e.initials, e.name].filter(Boolean).join(" ") || "—"}
                  </span>
                  {e.occupation && (
                    <span style={{ color: "#7a7054", fontSize: 9 }}>{e.occupation}</span>
                  )}
                  {e.page_number != null && (
                    <span style={{ color: "#7a7054", fontSize: 9 }}>{t('page')} {e.page_number}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
