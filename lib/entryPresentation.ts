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

export type EntryPresentationLabels = {
  badgeAdvertisement: string;
  badgeInstitution: string;
  badgeOrganization: string;
  badgeText: string;
  detailDescription: string;
  detailMention: string;
  detailContext: string;
  detailRole: string;
  detailOccupation: string;
  sectionAdvertisement: string;
  sectionInstitutional: string;
  sectionNameRegister: string;
  sectionOccupationRegister: string;
  sectionOther: string;
  sectionStreetRegister: string;
  sectionRegisterDefault: string;
};

const DUTCH_LABELS: EntryPresentationLabels = {
  badgeAdvertisement: "Advertentie",
  badgeInstitution: "Instelling",
  badgeOrganization: "Organisatie",
  badgeText: "Tekst",
  detailDescription: "Beschrijving",
  detailMention: "Vermelding",
  detailContext: "Context",
  detailRole: "Rol",
  detailOccupation: "Beroep",
  sectionAdvertisement: "Advertentie",
  sectionInstitutional: "Instellingen",
  sectionNameRegister: "Naamregister",
  sectionOccupationRegister: "Beroepenregister",
  sectionOther: "Tekst",
  sectionStreetRegister: "Stratenregister",
  sectionRegisterDefault: "Register",
};

function buildSectionLabels(labels: EntryPresentationLabels): Record<string, string> {
  return {
    advertisement: labels.sectionAdvertisement,
    institutional: labels.sectionInstitutional,
    name_register: labels.sectionNameRegister,
    occupation_register: labels.sectionOccupationRegister,
    other: labels.sectionOther,
    street_register: labels.sectionStreetRegister,
  };
}

export function buildEntryPresentationLabels(
  t: (key: keyof EntryPresentationLabels) => string
): EntryPresentationLabels {
  return {
    badgeAdvertisement: t("badgeAdvertisement"),
    badgeInstitution: t("badgeInstitution"),
    badgeOrganization: t("badgeOrganization"),
    badgeText: t("badgeText"),
    detailDescription: t("detailDescription"),
    detailMention: t("detailMention"),
    detailContext: t("detailContext"),
    detailRole: t("detailRole"),
    detailOccupation: t("detailOccupation"),
    sectionAdvertisement: t("sectionAdvertisement"),
    sectionInstitutional: t("sectionInstitutional"),
    sectionNameRegister: t("sectionNameRegister"),
    sectionOccupationRegister: t("sectionOccupationRegister"),
    sectionOther: t("sectionOther"),
    sectionStreetRegister: t("sectionStreetRegister"),
    sectionRegisterDefault: t("sectionRegisterDefault"),
  };
}

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
  fallbackSection?: EntrySection | null,
  labels: EntryPresentationLabels = DUTCH_LABELS
): EntryPresentation {
  const section = entry?.section ?? fallbackSection ?? "";
  const title = formatEntryName(entry) || "-";
  const occupation = entry?.occupation_expanded || entry?.occupation || "";
  const role = entry?.role || "";
  const description = entry?.description || entry?.notes || "";
  const address = entry?.address_full || "";
  const parent = entry?.parent_organization || "";
  const kind = classifyEntry(entry, section);
  const sectionLabels = buildSectionLabels(labels);
  const sectionLabelResolved = sectionLabels[section] || section || labels.sectionRegisterDefault;

  if (kind === "advertisement") {
    return {
      kind,
      badge: labels.badgeAdvertisement,
      title,
      subtitle: description || occupation,
      detailLabel: description ? labels.detailDescription : labels.detailMention,
      detail: description || occupation || "-",
      address,
      sectionLabel: sectionLabelResolved,
      showMapStatus: true,
    };
  }

  if (kind === "organization") {
    return {
      kind,
      badge: section === "institutional" ? labels.badgeInstitution : labels.badgeOrganization,
      title,
      subtitle: description || occupation || parent,
      detailLabel: description ? labels.detailDescription : labels.detailContext,
      detail: description || occupation || parent || "-",
      address,
      sectionLabel: sectionLabelResolved,
      showMapStatus: true,
    };
  }

  if (kind === "institutional") {
    return {
      kind,
      badge: labels.badgeInstitution,
      title,
      subtitle: [role, parent].filter(Boolean).join(" / "),
      detailLabel: role ? labels.detailRole : labels.detailContext,
      detail: role || parent || description || "-",
      address,
      sectionLabel: sectionLabelResolved,
      showMapStatus: address.length > 0,
    };
  }

  if (kind === "text") {
    return {
      kind,
      badge: labels.badgeText,
      title,
      subtitle: description || occupation,
      detailLabel: labels.detailMention,
      detail: description || occupation || "-",
      address,
      sectionLabel: sectionLabelResolved,
      showMapStatus: address.length > 0,
    };
  }

  return {
    kind,
    badge: null,
    title,
    subtitle: occupation,
    detailLabel: labels.detailOccupation,
    detail: occupation || "-",
    address,
    sectionLabel: sectionLabelResolved,
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
