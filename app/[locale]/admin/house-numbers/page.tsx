import Link from "next/link";
import { listHouseNumberCandidates } from "@/lib/adminHouseNumbers";
import { getDb } from "@/lib/db";
import CorrectionTable from "./CorrectionTable";

export const dynamic = "force-dynamic";

export default async function HouseNumbersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ minDigits?: string }>;
}) {
  const { locale } = await params;
  const { minDigits: minDigitsParam } = await searchParams;
  const minDigits = parseInt(minDigitsParam || "2", 10);
  
  const db = getDb();
  const candidates = listHouseNumberCandidates(db, minDigits);

  return (
    <div
      className="min-h-screen bg-bp-blue text-bp-ink"
      style={{ padding: "32px 32px 64px", fontFamily: "var(--font-josefin-sans)" }}
    >
      <header className="flex items-end justify-between mb-[24px]">
        <div>
          <div
            className="text-bp-ink-dim uppercase mb-[4px]"
            style={{ fontSize: 9, letterSpacing: "0.22em" }}
          >
            § Admin — Adressering
          </div>
          <h1
            className="text-bp-amber font-bold uppercase"
            style={{ fontSize: 24, letterSpacing: "0.18em" }}
          >
            Huisnummer Correctie
          </h1>
        </div>
        <div className="flex items-center gap-[14px]">
          <form method="GET" className="flex items-center gap-2">
            <label 
              htmlFor="minDigits" 
              className="text-bp-ink-dim uppercase"
              style={{ fontSize: 9, letterSpacing: "0.18em" }}
            >
              Filter:
            </label>
            <select 
              name="minDigits" 
              id="minDigits"
              defaultValue={minDigits}
              onChange={(e) => e.target.form?.submit()}
              className="bg-bp-blue text-bp-amber border border-bp-amber/50 px-2 py-1 focus:outline-none focus:border-bp-amber"
              style={{ fontSize: 11, fontFamily: "var(--font-josefin-sans)" }}
            >
              <option value="2">&gt; 2 cijfers</option>
              <option value="3">&gt; 3 cijfers</option>
              <option value="4">&gt; 4 cijfers</option>
            </select>
          </form>
          <Link
            href={`/${locale}/admin/stats`}
            className="uppercase font-bold transition-colors hover:bg-bp-amber/15"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              border: "1px solid #e8b84c88",
              color: "#e8b84c",
              background: "transparent",
              padding: "5px 11px",
            }}
          >
            ← Statistieken
          </Link>
        </div>
      </header>

      <p
        className="text-bp-ink-dim mb-[24px]"
        style={{ fontSize: 10, letterSpacing: "0.08em", maxWidth: 640 }}
      >
        Gevonden: {candidates.length} (eerste 25) niet-gekoppelde huisnummers met meer dan {minDigits} cijfers.
        Dit zijn waarschijnlijk OCR-fouten (bijv. 52¹ gelezen als 521).
        Alleen adressen met een bekende straatnaam worden getoond.
      </p>

      <CorrectionTable candidates={candidates} />
    </div>
  );
}
