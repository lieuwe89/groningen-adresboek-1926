"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SectionJump from "./SectionJump";
import { useTranslations, useLocale } from 'next-intl';

export default function Header() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || "";
  
  const isAdmin = pathname.includes("/admin");
  const stemMatch = pathname.match(/page\/([^/]+)/);
  const stem = stemMatch?.[1];

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
    
    // Detect proxy prefix (e.g. /groningen-1926) from window.location
    const prefix = typeof window !== 'undefined' 
      ? window.location.pathname.replace(pathname, '') 
      : '';
      
    const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(prefix + newPathname);
  };

  const adminHref = isAdmin
    ? stem
      ? `/${locale}/page/${stem}`
      : `/${locale}`
    : stem
      ? `/${locale}/admin/page/${stem}`
      : `/${locale}/admin`;

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
          {t('subtitle')}
        </div>
        <h1
          className="text-bp-amber font-bold uppercase"
          style={{ fontSize: 15, letterSpacing: "0.28em" }}
        >
          {t('title')}
        </h1>
        <div
          className="text-bp-ink-bright uppercase"
          style={{ fontSize: 8.5, letterSpacing: "0.18em" }}
        >
          {t('description')}
        </div>
        <div className="flex gap-[20px] mt-[5px] items-end">
          <SectionJump currentStem={stem} />
          <Meta label={t('labelSheet')} value="A — Z" />
        </div>
      </div>
      <div className="flex items-center gap-[14px]">
        <InfoBtn 
          label={t('info')}
          active={pathname.endsWith("/info")} 
          href={
            typeof window !== 'undefined' 
              ? window.location.pathname.replace(pathname, '') + (pathname.endsWith("/info") ? `/${locale}` : `/${locale}/info`)
              : (pathname.endsWith("/info") ? `/${locale}` : `/${locale}/info`)
          }
        />
        <div className="flex gap-[2px]">
          <button 
            onClick={() => switchLocale('nl')}
            className={`px-[7px] py-[3px] uppercase font-bold border transition-colors text-[9px] tracking-[0.18em] ${
              locale === 'nl' 
                ? "text-bp-amber border-bp-amber/60 cursor-default" 
                : "text-bp-ink-dim border-bp-ink-dim/20 hover:text-bp-amber hover:border-bp-amber/40"
            }`}
          >
            NL
          </button>
          <button 
            onClick={() => switchLocale('en')}
            className={`px-[7px] py-[3px] uppercase font-bold border transition-colors text-[9px] tracking-[0.18em] ${
              locale === 'en' 
                ? "text-bp-amber border-bp-amber/60 cursor-default" 
                : "text-bp-ink-dim border-bp-ink-dim/20 hover:text-bp-amber hover:border-bp-amber/40"
            }`}
          >
            EN
          </button>
        </div>
        {isAdmin && (
          <Link
            href={`/${locale}/admin/stats`}
            prefetch={false}
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
            {t('stats')}
          </Link>
        )}
        <Link
          href={adminHref}
          prefetch={false}
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
          {isAdmin ? t('public') : t('admin')}
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

function InfoBtn({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      id="tour-info"
      href={href}
      className="flex items-center gap-[5px] uppercase font-bold transition-colors hover:bg-bp-amber/15"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        border: active ? "1px solid #e8b84c" : "1px solid #7a705488",
        color: active ? "#182d5c" : "#e8b84c",
        background: active ? "#e8b84c" : "transparent",
        padding: "3px 9px",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="8.5" strokeLinecap="round" />
        <line x1="12" y1="11" x2="12" y2="16" strokeLinecap="round" />
      </svg>
      {label}
    </Link>
  );
}
