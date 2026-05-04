export default function Footer() {
  return (
    <footer
      className="flex items-center justify-between border-t border-bp-ink/55 px-[22px]"
      style={{ height: 26 }}
    >
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
      >
        Technisch Bureau — Gemeente Groningen — 1926
      </span>
      <span
        className="text-bp-amber uppercase"
        style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
      >
        Nr. Grn/Adr/1926 — 21 Nov. 1926
      </span>
    </footer>
  );
}
