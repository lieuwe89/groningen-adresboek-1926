"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type SectionInfo = {
  section: string;
  label: string;
  first_stem: string;
  first_scan_number: number | null;
  first_page_number: number | null;
  count: number;
};

type Props = {
  // Optional: stem of the page currently being viewed. Used to mark the
  // current section in the dropdown so users see where they are.
  currentStem?: string;
};

export default function SectionJump({ currentStem }: Props) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [sections, setSections] = useState<SectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/sections")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { sections: SectionInfo[] };
      })
      .then((j) => {
        if (alive) setSections(j.sections);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  // Resolve current section from currentStem by finding the section whose
  // first_stem is the highest stem <= currentStem (sections are stem-sorted).
  function currentSectionId(): string {
    if (!currentStem || !sections) return "";
    let cur = "";
    for (const s of sections) {
      if (s.first_stem <= currentStem) cur = s.section;
      else break;
    }
    return cur;
  }

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id || !sections) return;
    const s = sections.find((x) => x.section === id);
    if (!s) return;
    router.push(`/page/${s.first_stem}`);
  }

  // Hide outside page routes (no stem / not page viewer).
  const onPageRoute = pathname.startsWith("/page/") || pathname.startsWith("/admin/page/");
  if (!onPageRoute) return null;

  const cur = currentSectionId();

  return (
    <div className="flex flex-col gap-[1px]">
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 7.5, letterSpacing: "0.18em", fontWeight: 600 }}
      >
        Sectie
      </span>
      <select
        value={cur}
        onChange={onChange}
        disabled={!sections || !!error}
        title={error ? `Fout bij laden: ${error}` : "Spring naar sectie"}
        className="text-bp-ink-bright uppercase outline-none cursor-pointer"
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          fontWeight: 600,
          background: "transparent",
          border: "1px solid #7a705488",
          color: "#e8b84c",
          padding: "2px 6px",
          minWidth: 150,
        }}
      >
        {sections === null && !error && <option value="">Laden…</option>}
        {error && <option value="">Fout</option>}
        {sections?.map((s) => (
          <option key={s.section} value={s.section} style={{ background: "#182d5c" }}>
            {s.label}
            {s.first_scan_number != null ? ` — scan ${s.first_scan_number}` : ""}
            {` (${s.count} pagina's)`}
          </option>
        ))}
      </select>
    </div>
  );
}
