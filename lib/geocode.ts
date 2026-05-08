/**
 * PDOK Locatieserver geocoding for Groningen addresses.
 *
 * Port of the Python `pdok_geocode()` from scripts/geocode_addresses.py.
 * Used server-side in the admin PATCH handler to re-geocode entries
 * when an address is edited.
 */

const PDOK_URL =
  "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

// Historical → modern street name aliases (same as geocode_addresses.py)
const STREET_ALIASES: [string, string][] = [
  ["verloren heereweg", "verlengde hereweg"],
  ["verloren hereweg", "verlengde hereweg"],
  ["friesche straatweg", "friesestraatweg"],
  ["hoornsche dijk", "hoornsedijk"],
  ["sint jans straat", "sint jansstraat"],
  ["sint janstraat", "sint jansstraat"],
  ["heerestraat", "herestraat"],
  ["heereweg", "hereweg"],
  ["heerebinnensingel", "herebinnensingel"],
  ["heeresingel", "heresingel"],
  ["heereplein", "hereplein"],
  ["hoornschedijk", "hoornsedijk"],
  ["hoornschediep", "hoornsediep"],
  ["helperwestsingel", "helper westsingel"],
  ["helperoostsingel", "helper oostsingel"],
  ["roodeweg", "rodeweg"],
  ["paulownastraat", "anna paulownastraat"],
  ["kooykerplein", "kooijkerplein"],
  ["hardewijkerstraat", "hardewikerstraat"],
  ["visscherstraat", "visserstraat"],
  ["a-kerkhof", "akerkhof"],
  ["a-kerk", "akerkhof"],
  ["verloren", "verlengde"],
];

const DIR_PREFIX = /^(noord(?:elijke|zijde)|zuid(?:elijke|zijde)|oost(?:elijke|zijde)|west(?:elijke|zijde))\s+/;
const BARE_KERKSTRAAT = /(?<![a-z-])kerkstraat/;

function normalizeQuery(address: string): string {
  let q = address.toLowerCase();
  
  // Handle "Street (verlengde)" -> "verlengde Street"
  q = q.replace(/(.+)\s+\(verlengde\)/, "verlengde $1");

  q = q.replace(DIR_PREFIX, "");
  for (const [old, repl] of STREET_ALIASES) {
    q = q.replace(old, repl);
  }
  q = q.replace(BARE_KERKSTRAAT, "helper kerkstraat");
  return q;
}

export interface GeocodeResult {
  status: "ok" | "no_match" | "no_number" | "error";
  lat?: number;
  lng?: number;
  score?: number;
  type?: string;
  matched?: string;
  query?: string;
  flags?: string[];
  detail?: string;
}

function computeFlags(result: GeocodeResult): string[] {
  if (result.status === "no_match" || result.status === "error") {
    return ["not_found"];
  }
  if (result.status === "ok") {
    const t = result.type || "";
    const score = result.score || 0;
    if (t === "gemeente" || t === "woonplaats" || score < 10) {
      return ["uncertain"];
    }
    if (t === "weg") {
      return ["uncertain"];
    }
  }
  return [];
}

/**
 * Geocode an address against PDOK Locatieserver, scoped to Groningen.
 *
 * Returns a result with lat/lng on success, or status indicating failure.
 */
export async function pdokGeocode(address: string): Promise<GeocodeResult> {
  if (!/\d/.test(address)) {
    return { status: "no_number" };
  }

  const query = normalizeQuery(`${address.toLowerCase()}, groningen`);
  const params = new URLSearchParams({
    q: query,
    fq: "woonplaatsnaam:Groningen",
    rows: "1",
    fl: "weergavenaam,centroide_ll,score,type",
  });
  const url = `${PDOK_URL}?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { status: "error", query, detail: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const docs = data?.response?.docs;
    if (!docs || docs.length === 0) {
      return { status: "no_match", query };
    }

    const doc = docs[0];
    const centroid = doc.centroide_ll as string | undefined;
    const m = centroid?.match(/POINT\(([0-9.]+)\s+([0-9.]+)\)/);
    if (!m) {
      return { status: "no_match", query };
    }

    const result: GeocodeResult = {
      status: "ok",
      query,
      lat: parseFloat(m[2]),
      lng: parseFloat(m[1]),
      score: doc.score,
      matched: doc.weergavenaam,
      type: doc.type,
    };
    result.flags = computeFlags(result);
    return result;
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      return { status: "error", query, detail: "timeout" };
    }
    return {
      status: "error",
      query,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
