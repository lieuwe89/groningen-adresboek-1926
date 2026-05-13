import Link from "next/link";
import { listMissingNumberCandidates } from "@/lib/adminHouseNumbers";
import { getDb } from "@/lib/db";
import MissingNumberTable from "./MissingNumberTable";

export const dynamic = "force-dynamic";

export default async function MissingNumbersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const db = getDb();
  const candidates = listMissingNumberCandidates(db);

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
            Ontbrekende huisnummers
          </h1>
        </div>
        <div className="flex items-center gap-[14px]">
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
        style={{ fontSize: 10, letterSpacing: "0.08em", maxWidth: 560 }}
      >
        {candidates.length} entries met een bekende straatnaam maar geen huisnummer (eerste 50).
        Bekijk de scan en voer het huisnummer in. Na opslaan wordt het adres opnieuw gegeocodeerd.
      </p>

      <MissingNumberTable candidates={candidates} />
    </div>
  );
}
