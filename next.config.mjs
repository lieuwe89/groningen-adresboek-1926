import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin(
  './i18n.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Served from groningen-1926.lieuwejongsma.nl (Caddy → container).
  // Clean paths — no assetPrefix needed.
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
