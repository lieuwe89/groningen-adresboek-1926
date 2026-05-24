const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeAssetBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "") || null;
}

function normalizeAssetPath(assetPath: string): string {
  return assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
}

export function resolvePublicAssetUrl({
  assetPath,
  cdnBaseUrl,
}: {
  assetPath: string;
  cdnBaseUrl?: string | null;
}): string {
  if (ABSOLUTE_URL_RE.test(assetPath)) return assetPath;

  const path = normalizeAssetPath(assetPath);
  const baseUrl = normalizeAssetBaseUrl(cdnBaseUrl);
  if (baseUrl) return `${baseUrl}${path}`;

  return path;
}
