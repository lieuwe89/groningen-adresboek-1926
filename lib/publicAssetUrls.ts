const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeAssetBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "") || null;
}

export function normalizeProxyPrefix(proxyPrefix: string | null | undefined): string {
  const trimmed = proxyPrefix?.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const segments = withLeadingSlash.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length % 2 === 0) {
    const half = segments.length / 2;
    const firstHalf = segments.slice(0, half);
    const secondHalf = segments.slice(half);
    if (firstHalf.every((segment, index) => segment === secondHalf[index])) {
      return `/${firstHalf.join("/")}`;
    }
  }
  return `/${segments.join("/")}`;
}

function normalizeAssetPath(assetPath: string): string {
  return assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
}

export function resolvePublicAssetUrl({
  assetPath,
  proxyPrefix,
  cdnBaseUrl,
}: {
  assetPath: string;
  proxyPrefix: string;
  cdnBaseUrl?: string | null;
}): string {
  if (ABSOLUTE_URL_RE.test(assetPath)) return assetPath;

  const path = normalizeAssetPath(assetPath);
  const baseUrl = normalizeAssetBaseUrl(cdnBaseUrl);
  if (baseUrl) return `${baseUrl}${path}`;

  const prefix = normalizeProxyPrefix(proxyPrefix);
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
    return path;
  }
  return `${prefix}${path}`;
}
