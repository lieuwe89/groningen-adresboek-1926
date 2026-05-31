import { ReactNode } from "react";
import Script from "next/script";

const openTrackerUrl = "https://www.lieuwejongsma.nl/wp-content/plugins/open-tracker/assets/js/ot-tracker.js";
const openTrackerRestUrl = "https://www.lieuwejongsma.nl/wp-json/open-tracker/v1";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
      <Script
        src={openTrackerUrl}
        data-ot-rest-url={openTrackerRestUrl}
        strategy="afterInteractive"
      />
    </html>
  );
}
