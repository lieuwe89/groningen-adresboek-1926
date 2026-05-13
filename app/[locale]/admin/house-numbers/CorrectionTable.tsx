"use client";

import { useState } from "react";
import ScanViewer from "@/components/ScanViewer";
import {
  houseNumberCorrectionPayload,
  type HouseNumberCandidate,
} from "@/lib/adminHouseNumbers";
import type { Bbox } from "@/lib/data";
import { useProxyUrl } from "@/lib/useProxyUrl";

export type Candidate = HouseNumberCandidate;

export default function CorrectionTable({ candidates }: { candidates: Candidate[] }) {
  const [items, setItems] = useState<Candidate[]>(candidates);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const { proxyPath } = useProxyUrl();

  // Reset items when candidates change (e.g. filter change)
  if (items.length === 0 && candidates.length > 0 && successIds.size === 0) {
      setItems(candidates);
  }
  
  // Also handle the case where candidates changed from props
  const [prevCandidates, setPrevCandidates] = useState(candidates);
  if (candidates !== prevCandidates) {
      setItems(candidates);
      setPrevCandidates(candidates);
      setSuccessIds(new Set());
  }

  async function handleSave(id: string, newNumber: string) {
    if (!newNumber.trim()) return;
    setSavingId(id);

    const [stem, idx] = id.split(":");

    try {
      const res = await fetch(proxyPath(`/api/admin/page/${stem}/entry/${idx}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(houseNumberCorrectionPayload(newNumber)),
      });
      if (!res.ok) throw new Error(await res.text());

      setSuccessIds((prev) => new Set(prev).add(id));
      setItems((prev) => prev.filter((item) => item.stable_id !== id));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to save correction.");
    } finally {
      setSavingId(null);
    }
  }

  function handleSkip(id: string) {
    setItems((prev) => prev.filter((item) => item.stable_id !== id));
  }

  if (items.length === 0) {
    return (
      <div
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 10, letterSpacing: "0.14em", marginTop: 32 }}
      >
        Geen kandidaten meer gevonden voor dit filter.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((item) => {
        const bbox: Bbox = JSON.parse(item.entry_bbox);
        const [stem] = item.stable_id.split(":");
        const isSaving = savingId === item.stable_id;

        return (
          <div
            key={item.stable_id}
            style={{
              border: "1px solid #e8b84c33",
              background: "#0e1c3c",
              display: "flex",
              gap: 20,
              alignItems: "flex-start",
              padding: 16,
            }}
          >
            <div style={{ flex: "0 0 55%", height: 200, background: "#060e22", overflow: "hidden", position: "relative" }}>
              <ScanViewer
                stem={stem}
                entries={[{ entry_bbox: bbox }] as any}
                activeIdx={0}
              />
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                className="text-bp-amber font-bold uppercase"
                style={{ fontSize: 12, letterSpacing: "0.12em" }}
              >
                {item.name || "—"}
              </div>
              <div
                className="text-bp-ink-bright"
                style={{ fontSize: 11, letterSpacing: "0.06em" }}
              >
                {item.address_street}
              </div>
              {item.address_full && (
                <div className="text-bp-ink-dim" style={{ fontSize: 9, letterSpacing: "0.08em" }}>
                  {item.address_full}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div
                  className="text-bp-ink-dim uppercase mb-[6px]"
                  style={{ fontSize: 8, letterSpacing: "0.18em" }}
                >
                  Corrigeer Huisnummer ({item.address_number})
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    defaultValue={item.address_number ?? ""}
                    className="bg-transparent text-bp-ink-bright focus:outline-none"
                    style={{
                      border: "1px solid #e8b84c66",
                      padding: "5px 10px",
                      fontSize: 12,
                      letterSpacing: "0.06em",
                      width: 100,
                    }}
                    disabled={isSaving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSave(item.stable_id, e.currentTarget.value);
                      }
                    }}
                  />
                  <button
                    className="uppercase font-bold hover:bg-bp-amber/20 transition-colors"
                    style={{
                      border: "1px solid #e8b84c88",
                      color: "#e8b84c",
                      background: "transparent",
                      padding: "5px 12px",
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      opacity: isSaving ? 0.5 : 1,
                    }}
                    disabled={isSaving}
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      handleSave(item.stable_id, input.value);
                    }}
                  >
                    {isSaving ? "…" : "Opslaan"}
                  </button>
                  <button
                    className="uppercase font-bold hover:bg-white/5 transition-colors"
                    style={{
                      border: "1px solid #e8b84c33",
                      color: "#7a7054",
                      background: "transparent",
                      padding: "5px 12px",
                      fontSize: 9,
                      letterSpacing: "0.16em",
                    }}
                    disabled={isSaving}
                    onClick={() => handleSkip(item.stable_id)}
                  >
                    Overslaan
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
