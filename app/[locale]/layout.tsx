import type { Metadata } from "next";
import { Josefin_Sans, Special_Elite } from "next/font/google";
import { SelectionProvider } from "@/lib/SelectionContext";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import "../globals.css";
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

export const metadata: Metadata = {
  title: "Adresboek 1926 — Gemeente Groningen",
  description: "Interactieve verkenner van het Groninger adresboek 1926",
  icons: {
    icon: "/groningen-1926/favicon.png",
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
    <div className={`${josefin.variable} ${specialElite.variable} h-full antialiased`}>
      <NextIntlClientProvider messages={messages} locale={locale}>
        <SelectionProvider>
          {children}
        </SelectionProvider>
      </NextIntlClientProvider>
    </div>
  );
}
