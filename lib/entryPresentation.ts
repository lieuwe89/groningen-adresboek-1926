export type EntrySection =
  | "advertisement"
  | "institutional"
  | "name_register"
  | "occupation_register"
  | "other"
  | "street_register"
  | string;

export type EntryEntityType = "organization" | "person" | string;

export type PresentableEntry = {
  name?: string | null;
  initials?: string | null;
  name_prefix?: string | null;
  occupation?: string | null;
  occupation_expanded?: string | null;
  address_full?: string | null;
  notes?: string | null;
  entity_type?: EntryEntityType | null;
  role?: string | null;
  parent_organization?: string | null;
  description?: string | null;
  section?: EntrySection | null;
};

export type EntryPresentationKind =
  | "advertisement"
  | "institutional"
  | "organization"
  | "person"
  | "text";

export type EntryPresentation = {
  kind: EntryPresentationKind;
  badge: string | null;
  title: string;
  subtitle: string;
  detailLabel: string;
  detail: string;
  address: string;
  sectionLabel: string;
  showMapStatus: boolean;
};

const SECTION_LABELS: Record<string, string> = {
  advertisement: "Advertentie",
  institutional: "Instellingen",
  name_register: "Naamregister",
  occupation_register: "Beroepenregister",
  other: "Tekst",
  street_register: "Stratenregister",
};

const BUSINESS_PATTERNS = [
  /\b(n\.?\s*v\.?|n\.v\.|fa\.|firma|geb(?:r|rs)\.?|maatschappij|vereeniging|vereniging)\b/i,
  /\b(bank|bureau|cafe|fabriek|handels|kantoor|stoomboot|winkel)\b/i,
  /\b(apotheek|drukkerij|garage|hotel|magazijn|slagerij|verzekering)\b/i,
];

const ORGANIZATION_ENTITY_TYPES = new Set([
  "organization",
  "facility",
  "service",
  "country",
]);

export function formatEntryName(entry: PresentableEntry | undefined): string {
  if (!entry) return "";
  const parts = [entry.name, entry.initials, entry.name_prefix].filter(Boolean);
  return parts.join(" ");
}

export function presentEntry(
  entry: PresentableEntry | undefined,
  fallbackSection?: EntrySection | null
): EntryPresentation {
  const section = entry?.section ?? fallbackSection ?? "";
  const title = formatEntryName(entry) || "-";
  const occupation = entry?.occupation_expanded || entry?.occupation || "";
  const role = entry?.role || "";
  const description = entry?.description || entry?.notes || "";
  const address = entry?.address_full || "";
  const parent = entry?.parent_organization || "";
  const kind = classifyEntry(entry, section);

  if (kind === "advertisement") {
    return {
      kind,
      badge: "Advertentie",
      title,
      subtitle: description || occupation,
      detailLabel: description ? "Beschrijving" : "Vermelding",
      detail: description || occupation || "-",
      address,
      sectionLabel: sectionLabel(section),
      showMapStatus: true,
    };
  }

  if (kind === "organization") {
    return {
      kind,
      badge: section === "institutional" ? "Instelling" : "Organisatie",
      title,
      subtitle: description || occupation || parent,
      detailLabel: description ? "Beschrijving" : "Context",
      detail: description || occupation || parent || "-",
      address,
      sectionLabel: sectionLabel(section),
      showMapStatus: true,
    };
  }

  if (kind === "institutional") {
    return {
      kind,
      badge: "Instelling",
      title,
      subtitle: [role, parent].filter(Boolean).join(" / "),
      detailLabel: role ? "Rol" : "Context",
      detail: role || parent || description || "-",
      address,
      sectionLabel: sectionLabel(section),
      showMapStatus: address.length > 0,
    };
  }

  if (kind === "text") {
    return {
      kind,
      badge: "Tekst",
      title,
      subtitle: description || occupation,
      detailLabel: "Vermelding",
      detail: description || occupation || "-",
      address,
      sectionLabel: sectionLabel(section),
      showMapStatus: address.length > 0,
    };
  }

  return {
    kind,
    badge: null,
    title,
    subtitle: occupation,
    detailLabel: "Beroep",
    detail: occupation || "-",
    address,
    sectionLabel: sectionLabel(section),
    showMapStatus: true,
  };
}

function classifyEntry(
  entry: PresentableEntry | undefined,
  section: EntrySection
): EntryPresentationKind {
  if (!entry) return "person";
  if (section === "advertisement") return "advertisement";
  if (section === "other") return "text";
  if (ORGANIZATION_ENTITY_TYPES.has(entry.entity_type || "")) return "organization";
  if (entry.entity_type === "person") {
    return section === "institutional" ? "institutional" : "person";
  }
  if (section === "institutional") {
    return entry.role ? "institutional" : "organization";
  }
  if (looksLikeBusiness(entry)) return "organization";
  return "person";
}

function looksLikeBusiness(entry: PresentableEntry): boolean {
  const name = entry.name || "";
  return BUSINESS_PATTERNS.some((pattern) => pattern.test(name));
}

function sectionLabel(section: EntrySection): string {
  return SECTION_LABELS[section] || section || "Register";
}
