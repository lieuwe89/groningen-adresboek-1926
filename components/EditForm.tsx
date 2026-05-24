"use client";

import { useEffect, useState } from "react";
import type { Entry } from "@/lib/data";

interface Props {
  stem: string;
  idx: number;
  entry: Entry;
  onSaved: () => void;
}

interface Flags {
  verified: boolean;
  needs_review: boolean;
  bbox_unreliable: boolean;
}

interface FieldState {
  name: string;
  initials: string;
  name_prefix: string;
  entity_type: string;
  occupation: string;
  occupation_expanded: string;
  address_street: string;
  address_street_expanded: string;
  address_number: string;
  notes: string;
}

function fromEntry(e: Entry): FieldState {
  return {
    name: e.name || "",
    initials: e.initials || "",
    name_prefix: e.name_prefix || "",
    entity_type: e.entity_type || "",
    occupation: e.occupation || "",
    occupation_expanded: e.occupation_expanded || "",
    address_street: e.address_street || "",
    address_street_expanded: e.address_street_expanded || "",
    address_number: e.address_number || "",
    notes: e.notes || "",
  };
}

function flagsFromEntry(e: Entry): Flags {
  return {
    verified: e.flags?.verified === true,
    needs_review: e.flags?.needs_review === true,
    bbox_unreliable: e.flags?.bbox_unreliable === true,
  };
}

export default function EditForm({ stem, idx, entry, onSaved }: Props) {
  const [state, setState] = useState<FieldState>(fromEntry(entry));
  const [initial, setInitial] = useState<FieldState>(fromEntry(entry));
  const [flags, setFlags] = useState<Flags>(flagsFromEntry(entry));
  const [initialFlags, setInitialFlags] = useState<Flags>(flagsFromEntry(entry));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = fromEntry(entry);
    const nextFlags = flagsFromEntry(entry);
    setState(next);
    setInitial(next);
    setFlags(nextFlags);
    setInitialFlags(nextFlags);
    setError(null);
  }, [entry, stem, idx]);

  const dirty =
    JSON.stringify(state) !== JSON.stringify(initial) ||
    JSON.stringify(flags) !== JSON.stringify(initialFlags);
  const set = <K extends keyof FieldState>(k: K, v: string) =>
    setState((s) => ({ ...s, [k]: v }));
  const setFlag = (k: keyof Flags, v: boolean) =>
    setFlags((s) => ({ ...s, [k]: v }));

  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setGeoStatus(null);
    try {
      const fields: Partial<FieldState> = {};
      (Object.keys(state) as (keyof FieldState)[]).forEach((k) => {
        if (state[k] !== initial[k]) fields[k] = state[k];
      });
      const flagsDiff: Partial<Flags> = {};
      (Object.keys(flags) as (keyof Flags)[]).forEach((k) => {
        if (flags[k] !== initialFlags[k]) flagsDiff[k] = flags[k];
      });
      const body: Record<string, unknown> = { fields };
      if (Object.keys(flagsDiff).length) body.flags = flagsDiff;
      const res = await fetch(`/api/admin/page/${stem}/entry/${idx}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      const json = await res.json();
      if (json.geocode) {
        const geo = json.geocode;
        if (geo.status === "ok") {
          const hasFlags = geo.flags && geo.flags.length > 0;
          setGeoStatus(
            hasFlags
              ? `⚠ Locatie bijgewerkt (${geo.matched || "onzeker"})`
              : `📍 Locatie bijgewerkt → ${geo.matched || "gevonden"}`
          );
        } else if (geo.status === "no_number") {
          setGeoStatus("⚠ Geen huisnummer — locatie gewist");
        } else {
          setGeoStatus("⚠ Adres niet gevonden — locatie gewist");
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const onRevert = () => {
    setState(initial);
    setFlags(initialFlags);
    setError(null);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-[6px] border-t border-bp-ink/55"
      style={{ padding: "8px 13px" }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-bp-amber uppercase"
          style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
        >
          Bewerken
        </span>
        <span
          className="text-bp-ink-dim uppercase"
          style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
        >
          # {idx}
        </span>
      </div>

      <div className="flex gap-[10px] flex-wrap" style={{ paddingBottom: 2 }}>
        <FlagBox
          label="Goed"
          color="#7fc97f"
          checked={flags.verified}
          onChange={(v) => {
            setFlag("verified", v);
            if (v) setFlag("needs_review", false);
          }}
        />
        <FlagBox
          label="Twijfel"
          color="#e8b84c"
          checked={flags.needs_review}
          onChange={(v) => {
            setFlag("needs_review", v);
            if (v) setFlag("verified", false);
          }}
        />
        <FlagBox
          label="Bbox slecht"
          color="#cc7a7a"
          checked={flags.bbox_unreliable}
          onChange={(v) => setFlag("bbox_unreliable", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-[6px]">
        <Field label="Naam" value={state.name} onChange={(v) => set("name", v)} />
        <Field label="Init." value={state.initials} onChange={(v) => set("initials", v)} />
      </div>
      <Field label="Voorvoegsel" value={state.name_prefix} onChange={(v) => set("name_prefix", v)} />
      <label className="flex flex-col gap-[2px]">
        <span
          className="text-bp-ink-dim uppercase"
          style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
        >
          Type
        </span>
        <select
          value={state.entity_type}
          onChange={(e) => set("entity_type", e.target.value)}
          className="bg-bp-ink-faint outline-none focus:border-bp-amber"
          style={{
            fontSize: 10,
            color: "#e6d9b0",
            border: "1px solid #cfc39a55",
            padding: "4px 6px",
          }}
        >
          <option value="">Auto</option>
          <option value="person">Persoon</option>
          <option value="organization">Organisatie</option>
        </select>
      </label>
      <Field label="Beroep (afk.)" value={state.occupation} onChange={(v) => set("occupation", v)} />
      <Field
        label="Beroep (volledig)"
        value={state.occupation_expanded}
        onChange={(v) => set("occupation_expanded", v)}
      />
      <div className="grid grid-cols-[1fr_auto] gap-[6px]">
        <Field
          label="Straat"
          value={state.address_street}
          onChange={(v) => set("address_street", v)}
        />
        <Field
          label="Nr."
          value={state.address_number}
          onChange={(v) => set("address_number", v)}
          width={70}
        />
      </div>
      <Field
        label="Straat (volledig)"
        value={state.address_street_expanded}
        onChange={(v) => set("address_street_expanded", v)}
      />
      <Field label="Notities" value={state.notes} onChange={(v) => set("notes", v)} />

      {error && (
        <span className="text-red-400" style={{ fontSize: 9 }}>
          {error}
        </span>
      )}
      {geoStatus && (
        <span
          className="text-bp-amber"
          style={{ fontSize: 9, letterSpacing: "0.05em" }}
        >
          {geoStatus}
        </span>
      )}

      <div className="flex items-center justify-between mt-[2px]">
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
          type="submit"
          disabled={!dirty || saving}
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
          {saving ? "Bezig…" : "Opslaan"}
        </button>
      </div>
    </form>
  );
}

function FlagBox({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center gap-[5px] cursor-pointer select-none"
      style={{ fontSize: 9, letterSpacing: "0.08em" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="appearance-none cursor-pointer"
        style={{
          width: 11,
          height: 11,
          border: `1px solid ${color}88`,
          background: checked ? color : "transparent",
        }}
      />
      <span style={{ color: checked ? color : "#7a7054" }} className="uppercase">
        {label}
      </span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  width,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  return (
    <label className="flex flex-col gap-[2px]" style={width ? { width } : undefined}>
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bp-ink-faint outline-none focus:border-bp-amber"
        style={{
          fontSize: 10,
          color: "#e6d9b0",
          border: "1px solid #cfc39a55",
          padding: "4px 6px",
        }}
      />
    </label>
  );
}
