import Link from "next/link";
import { useTranslations } from 'next-intl';
import packageJson from '@/package.json';

export default function Footer() {
  const t = useTranslations('Footer');
  
  return (
    <footer
      className="flex items-center justify-between border-t border-bp-ink/55 px-[22px]"
      style={{ height: 26 }}
    >
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
      >
        {t.rich('builtBy', {
          name: (chunks) => (
            <Link
              href="https://lieuwejongsma.nl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bp-amber hover:underline"
            >
              {chunks}
            </Link>
          ),
          year: 2026
        })}
      </span>
      <span
        className="text-bp-ink-dim uppercase"
        style={{ fontSize: 9, letterSpacing: "0.2em", fontWeight: 600 }}
      >
        v{packageJson.version}
      </span>
    </footer>
  );
}
