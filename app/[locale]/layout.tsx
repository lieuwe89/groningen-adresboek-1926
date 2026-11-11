import type { Metadata } from "next";
import { Abril_Fatface, Josefin_Sans, Old_Standard_TT, Special_Elite } from "next/font/google";
import { BOOK } from "@/lib/book";
import { SelectionProvider } from "@/lib/SelectionContext";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import "../globals.css";
// Shepherd base CSS first so shepherd-theme.css overrides it. The JS side of
// shepherd.js is dynamically imported in lib/useTour.ts.
import "shepherd.js/dist/css/shepherd.css";
import "../shepherd-theme.css";

const josefin = Josefin_Sans({
  variable: "--font-josefin-sans",
  weight: ["300", "400", "600", "700"],
  subsets: ["latin"],
});

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  weight: "400",
  subsets: ["latin"],
});

// next/font needs literal calls at module scope, so every book's fonts are
// declared; the 1854 ones are not preloaded and only load when applied.
const oldStandard = Old_Standard_TT({
  variable: "--font-old-standard",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  preload: false,
});

const abril = Abril_Fatface({
  variable: "--font-abril",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

const FONT_CLASSES: Record<string, string> = {
  "1926": `${josefin.variable} ${specialElite.variable}`,
  "1854": `${oldStandard.variable} ${abril.variable}`,
};

export const metadata: Metadata = {
  title: BOOK.title,
  description: BOOK.description,
  icons: {
    icon: "/favicon.png",
  },
};

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  if (!['nl', 'en'].includes(locale)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <div className={`${FONT_CLASSES[BOOK.id]} book-fonts h-full antialiased`}>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <SelectionProvider>
          {children}
        </SelectionProvider>
      </NextIntlClientProvider>
    </div>
  );
}
