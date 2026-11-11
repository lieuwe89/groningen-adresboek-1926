"use client";

import Link from "next/link";

export default function AdminBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="uppercase font-bold transition-colors hover:bg-bp-amber/15"
      style={{
        fontSize: 9,
        letterSpacing: "0.18em",
        border: "1px solid color-mix(in srgb, var(--color-bp-amber) 53%, transparent)",
        color: "var(--color-bp-amber)",
        background: "transparent",
        padding: "5px 11px",
      }}
    >
      {label}
    </Link>
  );
}
