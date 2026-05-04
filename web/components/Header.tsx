"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SectionJump from "./SectionJump";

export default function Header() {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");
  const stemMatch = pathname.match(/page\/([^/]+)/);
  const stem = stemMatch?.[1];
  const adminHref = isAdmin
    ? stem
      ? `/page/${stem}`
      : "/"
    : stem
      ? `/admin/page/${stem}`
      : "/admin";
  return (
    <header
      className="relative flex items-end justify-between border-b border-bp-ink/55 px-[22px] pt-[10px] pb-[8px]"
      style={{ minHeight: 68 }}
    >
      <div className="flex flex-col gap-[3px]">
        <div
          className="text-bp-ink-dim font-semibold uppercase"
          style={{ fontSize: 8.5, letterSpacing: "0.22em" }}
        >
          “Gemeente Groningen” — Adresboek
        </div>
        <h1
          className="text-bp-amber font-bold uppercase"
          style={{ fontSize: 15, letterSpacing: "0.28em" }}
        >
          Adresboek 1926
        </h1>
        <div
          className="text-bp-ink-bright uppercase"
          style={{ fontSize: 8.5, letterSpacing: "0.18em" }}
        >
          Interactieve verkenner — Naamregister &amp; Plattegrond
        </div>
        <div className="flex gap-[20px] mt-[5px] items-end">
          <Meta label="Schaal" value="1 : 8 000" />
          <SectionJump currentStem={stem} />
          <Meta label="Blad" value="A — Z" />
        </div>
      </div>
      <div className="flex items-center gap-[14px]">
        <div className="flex gap-[2px]">
          <LangBtn label="NL" active />
          <LangBtn label="EN" />
        </div>
        {isAdmin && (
          <Link
            href="/admin/stats"
            className="uppercase font-bold transition-colors hover:bg-bp-amber/15"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              border: "1px solid #7a705488",
              color: "#e8b84c",
              background: "transparent",
              padding: "3px 9px",
            }}
          >
            Stats
          </Link>
        )}
        <Link
          href={adminHref}
          className="uppercase font-bold transition-colors hover:bg-bp-amber/15"
          style={{
            fontSize: 9,
            letterSpacing: "0.18em",
            border: isAdmin ? "1px solid #e8b84c" : "1px solid #7a705488",
            color: isAdmin ? "#182d5c" : "#e8b84c",
            background: isAdmin ? "#e8b84c" : "transparent",
            padding: "3px 9px",
          }}
        >
          {isAdmin ? "Publiek" : "Admin"}
        </Link>
        <div
          className="text-bp-ink-dim"
          style={{ fontSize: 7.5, letterSpacing: "0.14em" }}
        >
          53°13′N · 6°34′E
        </div>
      </div>
    </header>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[1px]">
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 7.5, letterSpacing: "0.18em", fontWeight: 600 }}
      >
        {label}
      </span>
      <span
        className="text-bp-ink-bright"
        style={{ fontSize: 8.5, letterSpacing: "0.08em" }}
      >
        {value}
      </span>
    </div>
  );
}

function LangBtn({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      className="px-[7px] py-[3px] uppercase font-bold transition-colors"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        border: active ? "1px solid #e8b84c99" : "1px solid #7a705444",
        color: active ? "#e8b84c" : "#7a7054",
        background: "transparent",
      }}
    >
      {label}
    </button>
  );
}
