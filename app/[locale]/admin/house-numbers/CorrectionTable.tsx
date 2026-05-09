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

  async function handleSave(id: string, newNumber: string) {
    if (!newNumber.trim()) return;
    setSavingId(id);

    // stable_id is "stem:idx"
    const [stem, idx] = id.split(":");

    try {
      const res = await fetch(proxyPath(`/api/admin/page/${stem}/entry/${idx}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(houseNumberCorrectionPayload(newNumber)),
      });
      if (!res.ok) throw new Error("Save failed");

      setSuccessIds((prev) => new Set(prev).add(id));
      setItems((prev) => prev.filter((item) => item.stable_id !== id));
    } catch (e) {
      console.error(e);
      alert("Failed to save correction.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const bbox: Bbox = JSON.parse(item.entry_bbox);
        const [stem] = item.stable_id.split(":");
        const isSuccess = successIds.has(item.stable_id);
        const isSaving = savingId === item.stable_id;

        return (
          <div
            key={item.stable_id}
            className={`border p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start ${
              isSuccess ? 'bg-green-50 border-green-200' : 'bg-white'
            }`}
          >
            <div className="w-full md:w-2/3 h-48 bg-gray-100 rounded overflow-hidden relative">
              <ScanViewer
                stem={stem}
                entries={[{ entry_bbox: bbox }] as any}
                activeIdx={0}
              />
            </div>

            <div className="w-full md:w-1/3 flex flex-col gap-2">
              <h3 className="font-bold">{item.name}</h3>
              <p className="text-sm text-gray-600">{item.address_street}</p>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  House Number Override
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue={item.address_number}
                    className="border rounded px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    disabled={isSuccess || isSaving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSave(item.stable_id, e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value !== item.address_number) {
                         handleSave(item.stable_id, e.target.value);
                      }
                    }}
                  />
                  <button
                    className={`px-4 py-2 rounded text-white font-medium ${
                      isSuccess ? 'bg-green-500' : isSaving ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                    disabled={isSuccess || isSaving}
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      handleSave(item.stable_id, input.value);
                    }}
                  >
                    {isSuccess ? 'Saved' : isSaving ? '...' : 'Save'}
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
