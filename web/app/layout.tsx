import type { Metadata } from "next";
import { Josefin_Sans, Special_Elite } from "next/font/google";
import { SelectionProvider } from "@/lib/SelectionContext";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className={`${josefin.variable} ${specialElite.variable} h-full antialiased`}>
      <body className="h-full">
        <SelectionProvider>
          {children}
        </SelectionProvider>
      </body>
    </html>
  );
}
