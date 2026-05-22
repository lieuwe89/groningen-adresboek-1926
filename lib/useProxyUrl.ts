"use client";

/**
 * Legacy hook from the playground.lieuwejongsma.nl/groningen-1926 era,
 * when the app sat behind a path-prefix reverse proxy. The app now runs
 * on its own subdomain (groningen-1926.lieuwejongsma.nl) with clean
 * paths, so the prefix is always empty and proxyPath is the identity.
 *
 * Kept as a thin shim so existing callsites compile without churn.
 * Safe to delete the hook and its imports once all callers are removed.
 */
export function useProxyUrl() {
  return {
    prefix: "",
    proxyPath: (path: string) => path,
  };
}
