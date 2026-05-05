import Link from "next/link";
import { computeStats, type PageStats, type SectionStats } from "@/lib/stats";
import { useLocale } from 'next-intl';

export const dynamic = "force-dynamic";

export default async function StatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const stats = await computeStats();
  const ov = stats.overall;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

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
            § Admin — Statistieken
          </div>
          <h1
            className="text-bp-amber font-bold uppercase"
            style={{ fontSize: 24, letterSpacing: "0.18em" }}
          >
            Voortgang
          </h1>
        </div>
        <div className="flex items-center gap-[14px]">
          <Link
            href={`/${locale}/admin/page/1769_19525-1926_0150`}
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
            ← Naar bewerker
          </Link>
        </div>
      </header>

      <section className="mb-[40px]">
        <SummaryCards ov={ov} />
        <div className="mt-[20px]">
          <ProgressBar
            label="Geverifieerd"
            value={ov.verified}
            total={ov.total}
            color="#7fc97f"
          />
          <ProgressBar
            label="Twijfel"
            value={ov.needs_review}
            total={ov.total}
            color="#e8b84c"
          />
          <ProgressBar
            label="Bbox slecht"
            value={ov.bbox_unreliable}
            total={ov.total}
            color="#cc7a7a"
          />
          <ProgressBar
            label="Bewerkt (any)"
            value={ov.edited}
            total={ov.total}
            color="#9fb8e8"
          />
        </div>
      </section>

      <section className="mb-[40px]">
        <SectionHeading>Per sectie</SectionHeading>
        <SectionTable rows={stats.bySection} />
      </section>

      {(() => {
        const editedPages = stats.byPage.filter(
          (r) => r.edited > 0 || r.verified > 0 || r.needs_review > 0
        );
        return (
          <section>
            <SectionHeading>
              Per pagina ({editedPages.length}){" "}
              <span
                className="text-bp-ink-dim"
                style={{ fontSize: 9, letterSpacing: "0.14em", marginLeft: 8 }}
              >
                (alleen pagina&apos;s met bewerkingen)
              </span>
            </SectionHeading>
            <PageTable rows={editedPages} locale={locale} />
          </section>
        );
      })()}

      <footer
        className="text-bp-ink-dim mt-[24px]"
        style={{ fontSize: 9, letterSpacing: "0.14em" }}
      >
        Gegenereerd: {stats.generatedAt}
      </footer>
    </div>
  );

  function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
      <h2
        className="text-bp-amber uppercase mb-[12px]"
        style={{ fontSize: 11, letterSpacing: "0.2em", fontWeight: 700 }}
      >
        {children}
      </h2>
    );
  }

  function SummaryCards({ ov }: { ov: typeof stats.overall }) {
    const cards = [
      { label: "Pagina's", value: ov.pages },
      { label: "Entries", value: ov.total },
      { label: "Geverifieerd", value: ov.verified, sub: `${pct(ov.verified, ov.total).toFixed(1)}%` },
      { label: "Twijfel", value: ov.needs_review },
      { label: "Bewerkt", value: ov.edited },
      { label: "Open", value: ov.unreviewed },
    ];
    return (
      <div className="grid grid-cols-3 md:grid-cols-6 gap-[10px]">
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              border: "1px solid #e8b84c44",
              padding: "12px 14px",
              background: "#0e1c3c",
            }}
          >
            <div
              className="text-bp-ink-dim uppercase"
              style={{ fontSize: 8, letterSpacing: "0.18em" }}
            >
              {c.label}
            </div>
            <div
              className="text-bp-amber"
              style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}
            >
              {c.value.toLocaleString("nl-NL")}
            </div>
            {c.sub && (
              <div className="text-bp-ink-bright" style={{ fontSize: 10, marginTop: 1 }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function ProgressBar({
    label,
    value,
    total,
    color,
  }: {
    label: string;
    value: number;
    total: number;
    color: string;
  }) {
    const p = pct(value, total);
    return (
      <div className="mb-[8px]">
        <div
          className="flex items-center justify-between"
          style={{ fontSize: 9, letterSpacing: "0.12em", marginBottom: 3 }}
        >
          <span className="text-bp-ink-bright uppercase">{label}</span>
          <span className="text-bp-ink-dim">
            {value.toLocaleString("nl-NL")} / {total.toLocaleString("nl-NL")} ·{" "}
            <span style={{ color }}>{p.toFixed(2)}%</span>
          </span>
        </div>
        <div
          style={{
            height: 8,
            background: "#0e1c3c",
            border: "1px solid #e8b84c33",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${p}%`,
              background: color,
              transition: "width 200ms",
            }}
          />
        </div>
      </div>
    );
  }

  function SectionTable({ rows }: { rows: SectionStats[] }) {
    return (
      <table className="w-full" style={{ fontSize: 10, borderCollapse: "collapse" }}>
        <thead>
          <Th cols={["Sectie", "Pagina's", "Entries", "Goed", "Twijfel", "Bbox slecht", "Bewerkt", "% Goed"]} />
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.section} style={{ borderBottom: "1px solid #e8b84c22" }}>
              <Td>{r.section}</Td>
              <Td num>{r.pages}</Td>
              <Td num>{r.total}</Td>
              <Td num color="#7fc97f">{r.verified}</Td>
              <Td num color="#e8b84c">{r.needs_review}</Td>
              <Td num color="#cc7a7a">{r.bbox_unreliable}</Td>
              <Td num>{r.edited}</Td>
              <Td num>{pct(r.verified, r.total).toFixed(1)}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function PageTable({ rows, locale }: { rows: PageStats[], locale: string }) {
    if (rows.length === 0) {
      return (
        <div className="text-bp-ink-dim" style={{ fontSize: 10 }}>
          Nog geen bewerkingen.
        </div>
      );
    }
    return (
      <table className="w-full" style={{ fontSize: 10, borderCollapse: "collapse" }}>
        <thead>
          <Th cols={["Pagina", "Sectie", "Entries", "Goed", "Twijfel", "Bewerkt", ""]} />
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stem} style={{ borderBottom: "1px solid #e8b84c22" }}>
              <Td num>{r.page}</Td>
              <Td>{r.section}</Td>
              <Td num>{r.total}</Td>
              <Td num color="#7fc97f">{r.verified}</Td>
              <Td num color="#e8b84c">{r.needs_review}</Td>
              <Td num>{r.edited}</Td>
              <Td>
                <Link
                  href={`/${locale}/admin/page/${r.stem}`}
                  className="text-bp-amber hover:underline"
                  style={{ fontSize: 9, letterSpacing: "0.1em" }}
                >
                  open →
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function Th({ cols }: { cols: string[] }) {
    return (
      <tr
        style={{
          borderBottom: "1px solid #e8b84c44",
          textAlign: "left",
          color: "#7a7054",
        }}
      >
        {cols.map((c, i) => (
          <th
            key={i}
            className="uppercase"
            style={{
              fontSize: 8,
              letterSpacing: "0.16em",
              fontWeight: 600,
              padding: "8px 10px 6px",
              textAlign: i === 0 ? "left" : "right",
            }}
          >
            {c}
          </th>
        ))}
      </tr>
    );
  }

  function Td({
    children,
    num,
    color,
  }: {
    children: React.ReactNode;
    num?: boolean;
    color?: string;
  }) {
    return (
      <td
        style={{
          padding: "6px 10px",
          textAlign: num ? "right" : "left",
          color: color || "#e6d9b0",
          fontFamily: num ? "var(--font-special-elite), monospace" : undefined,
        }}
      >
        {children}
      </td>
    );
  }
}
