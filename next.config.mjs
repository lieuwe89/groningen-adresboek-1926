import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin(
  './i18n.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The app is reverse-proxied to playground.lieuwejongsma.nl/groningen-1926.
  // The Apache proxy strips /groningen-1926 before forwarding to fly.io,
  // so the Next.js server sees clean paths (no prefix needed for routing).
  // assetPrefix makes the *browser* fetch all _next/ resources and RSC
  // payloads from /groningen-1926/_next/... so they go through the proxy.
  assetPrefix: '/groningen-1926',
  async headers() {
    const longLivedAssetHeaders = [
      {
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      },
    ];

    return [
      {
        source: '/tiles/:path*',
        headers: longLivedAssetHeaders,
      },
      {
        source: '/maps/:path*',
        headers: longLivedAssetHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
