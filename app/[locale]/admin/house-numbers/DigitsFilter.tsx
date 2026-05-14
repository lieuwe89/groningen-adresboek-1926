"use client";

import { useRouter, usePathname } from "next/navigation";

export default function DigitsFilter({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams({ minDigits: e.target.value });
    router.push(`${pathname}?${params}`);
  }

  return (
    <form className="flex items-center gap-2">
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
        value={value}
        onChange={handleChange}
        className="bg-bp-blue text-bp-amber border border-bp-amber/50 px-2 py-1 focus:outline-none focus:border-bp-amber"
        style={{ fontSize: 11, fontFamily: "var(--font-josefin-sans)" }}
      >
        <option value="2">&gt; 2 cijfers</option>
        <option value="3">&gt; 3 cijfers</option>
        <option value="4">&gt; 4 cijfers</option>
      </select>
    </form>
  );
}
