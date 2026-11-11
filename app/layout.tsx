import { ReactNode } from "react";
import Script from "next/script";
import { BOOK } from "@/lib/book";

const openTrackerUrl = "https://www.lieuwejongsma.nl/wp-content/plugins/open-tracker/assets/js/ot-tracker.js";
const openTrackerRestUrl = "https://www.lieuwejongsma.nl/wp-json/open-tracker/v1";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-book={BOOK.id}>
      <body>{children}</body>
      <Script
        src={openTrackerUrl}
        data-ot-rest-url={openTrackerRestUrl}
        strategy="afterInteractive"
      />
    </html>
  );
}
