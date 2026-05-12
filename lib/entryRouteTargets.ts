export type PageMode = "admin" | "public";

interface BuildPageModeHrefOptions {
  locale: string;
  mode: PageMode;
  stem?: string;
  activeIdx?: number | null;
  currentSearch?: string | URLSearchParams | null;
}

function paramsFromCurrentSearch(currentSearch: string | URLSearchParams | null | undefined) {
  if (!currentSearch) return new URLSearchParams();
  if (typeof currentSearch === "string") {
    return new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  }
  return new URLSearchParams(currentSearch.toString());
}

function stemFromEntryParam(entry: string | null) {
  if (!entry) return null;
  const sep = entry.lastIndexOf(":");
  return sep > 0 ? entry.slice(0, sep) : null;
}

export function buildPageModeHref({
  locale,
  mode,
  stem,
  activeIdx,
  currentSearch,
}: BuildPageModeHrefOptions) {
  const params = paramsFromCurrentSearch(currentSearch);
  const root = mode === "admin" ? `/${locale}/admin` : `/${locale}`;

  if (!stem) {
    params.delete("entry");
    const query = params.toString();
    return query ? `${root}?${query}` : root;
  }

  if (typeof activeIdx === "number" && Number.isFinite(activeIdx) && activeIdx >= 0) {
    params.set("entry", `${stem}:${Math.trunc(activeIdx)}`);
  } else if (stemFromEntryParam(params.get("entry")) !== stem) {
    params.delete("entry");
  }

  const base = `${root}/page/${stem}`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
