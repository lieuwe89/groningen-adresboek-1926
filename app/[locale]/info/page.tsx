"use client";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GlobalGrid from "@/components/GlobalGrid";
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useProxyUrl } from "@/lib/useProxyUrl";

/* ── Map profiles ──────────────────────────────────────────────────────────── */

interface MapProfile {
  id: string;
  thumb: string;
  title: string;
  appLabel: string;
  date: string;
  scale: string;
  creator?: string;
  publisher: string;
  technique: string;
  dimensions: string;
  hdl: string;
  description: string;
}

const MAPS_NL: MapProfile[] = [
  {
    id: "1536_6133",
    thumb: "1536_6133.jpg",
    title: "Plattegrond van Groningen",
    appLabel: "Heeringa, circa 1919",
    date: "1918–1920",
    scale: "1 : 5.000",
    creator: "G. Heeringa, opzichter-teekenaar Gemeentewerken",
    publisher: "Scholtens & Zoon, Groningen",
    technique: "Litho, gekleurd",
    dimensions: "73 × 61 cm (blad 86 × 70 cm)",
    hdl: "https://hdl.handle.net/21.12105/e2b48c81-bbba-02ee-d11a-c443e225ca01",
    description:
      "Gedetailleerde stadsplattegrond op de grootste beschikbare schaal (1:5.000), vervaardigd aan de hand van officiële gemeentelijke gegevens. Met wijkindeling en lijst van voornaamste gestichten en gebouwen.",
  },
  {
    id: "1536_6138",
    thumb: "1536_6138.jpg",
    title: "Gemeente Groningen",
    appLabel: "Darmer, 1935",
    date: "1935",
    scale: "1 : 10.000",
    creator: "H. Darmer, Dienst der Stadsuitbreiding en Volkshuisvesting",
    publisher: "Gemeente Groningen",
    technique: "Lichtdruk",
    dimensions: "66 × 74 cm (blad 80 × 96 cm)",
    hdl: "https://hdl.handle.net/21.12105/07ef9907-4eb9-bd09-e9bc-aa24eb7d30e9",
    description:
      "Ambtelijke gemeentekaart uit 1935, vervaardigd door de Dienst der Stadsuitbreiding. Toont de volledige gemeente inclusief coördinatenraster en kompasroos.",
  },
  {
    id: "1536_1237",
    thumb: "1536_1237.jpg",
    title: "Pharus plattegrond van Groningen",
    appLabel: "Pharus, circa 1916",
    date: "ca. 1916",
    scale: "1 : 10.000",
    publisher: "P. Noordhoff, Groningen",
    technique: "Kleurendruk",
    dimensions: "65 × 45,5 cm",
    hdl: "https://hdl.handle.net/21.12105/0d2798ae-d0a8-0e52-9a95-430434cee8a2",
    description:
      "Stadsplattegrond uit de bekende Pharus-serie, waarop een aantal belangrijke gebouwen in opstand is ingetekend. Gedrukt bij uitgever P. Noordhoff te Groningen.",
  },
  {
    id: "1536_1698",
    thumb: "1536_1698.jpg",
    title: "Plattegrond van Groningen",
    appLabel: "Edzes, circa 1920",
    date: "1918–1922",
    scale: "1 : 10.000",
    publisher: "H. Edzes jr., Groningen",
    technique: "Kleurendruk",
    dimensions: "59 × 41 cm (blad 66 × 50 cm)",
    hdl: "https://hdl.handle.net/21.12105/35ed5d8a-6c5b-4e19-6399-71c45ba2de43",
    description:
      "Stadsplattegrond met lijst van voornaamste gebouwen en alfabetisch straatnaamregister, uitgegeven door H. Edzes jr. te Groningen. Gedrukt bij lith. N.V. W.R. Casparie & Zn.",
  },
  {
    id: "0817_00950",
    thumb: "0817_00950-1_0001.jpg",
    title: "Plattegrond van Groningen — 1 : 10.000",
    appLabel: "Bouma, circa 1922",
    date: "ca. 1920–1925",
    scale: "1 : 10.000 / 1 : 50.000",
    creator: "S.J. Bouma, teekenaar Gemeentewerken",
    publisher: "VVV Groningen",
    technique: "Litho, gekleurd",
    dimensions: "54 × 37 cm",
    hdl: "https://hdl.handle.net/21.12105/b6a4cf51-c4b6-b096-f0da-a8111d7060ac",
    description:
      "Toeristische stadsplattegrond uitgegeven door de VVV, met aanvullende wandelkaart van de omstreken en aanduiding van tram- en autobuslijnen. Op de achterzijde toeristische informatie in vier talen.",
  },
  {
    id: "1536_1554",
    thumb: "1536_1554.jpg",
    title: "Groningen — Centrum",
    appLabel: "VVV, circa 1930",
    date: "ca. 1920–1940",
    scale: "1 : 10.000",
    publisher: "VVV Groningen",
    technique: "Kleurendruk",
    dimensions: "31 × 25 cm (gevouwen: 25 × 11 cm)",
    hdl: "https://hdl.handle.net/21.12105/2f2ae1c5-3e1b-bc4e-1a6e-124d168fd428",
    description:
      "Compacte centrumplattegrond, uitgegeven door de VVV met aanduiding van straten met eenrichtingsverkeer. Verso vermeldt de verkeersregels voor de weg.",
  },
];

const MAPS_EN: MapProfile[] = [
  {
    id: "1536_6133",
    thumb: "1536_6133.jpg",
    title: "Map of Groningen",
    appLabel: "Heeringa, c. 1919",
    date: "1918-1920",
    scale: "1 : 5,000",
    creator: "G. Heeringa, draftsman and supervisor, Municipal Works",
    publisher: "Scholtens & Zoon, Groningen",
    technique: "Lithograph, colored",
    dimensions: "73 x 61 cm (sheet 86 x 70 cm)",
    hdl: "https://hdl.handle.net/21.12105/e2b48c81-bbba-02ee-d11a-c443e225ca01",
    description:
      "Detailed city map at the largest available scale (1:5,000), made from official municipal data. Includes district boundaries and a list of major institutions and buildings.",
  },
  {
    id: "1536_6138",
    thumb: "1536_6138.jpg",
    title: "Municipality of Groningen",
    appLabel: "Darmer, 1935",
    date: "1935",
    scale: "1 : 10,000",
    creator: "H. Darmer, Department of Urban Expansion and Housing",
    publisher: "Municipality of Groningen",
    technique: "Collotype",
    dimensions: "66 x 74 cm (sheet 80 x 96 cm)",
    hdl: "https://hdl.handle.net/21.12105/07ef9907-4eb9-bd09-e9bc-aa24eb7d30e9",
    description:
      "Official municipal map from 1935, produced by the Department of Urban Expansion. Shows the full municipality, including a coordinate grid and compass rose.",
  },
  {
    id: "1536_1237",
    thumb: "1536_1237.jpg",
    title: "Pharus map of Groningen",
    appLabel: "Pharus, c. 1916",
    date: "c. 1916",
    scale: "1 : 10,000",
    publisher: "P. Noordhoff, Groningen",
    technique: "Color print",
    dimensions: "65 x 45.5 cm",
    hdl: "https://hdl.handle.net/21.12105/0d2798ae-d0a8-0e52-9a95-430434cee8a2",
    description:
      "City map from the well-known Pharus series, with several important buildings drawn in elevation. Printed by publisher P. Noordhoff in Groningen.",
  },
  {
    id: "1536_1698",
    thumb: "1536_1698.jpg",
    title: "Map of Groningen",
    appLabel: "Edzes, c. 1920",
    date: "1918-1922",
    scale: "1 : 10,000",
    publisher: "H. Edzes jr., Groningen",
    technique: "Color print",
    dimensions: "59 x 41 cm (sheet 66 x 50 cm)",
    hdl: "https://hdl.handle.net/21.12105/35ed5d8a-6c5b-4e19-6399-71c45ba2de43",
    description:
      "City map with a list of major buildings and an alphabetical street index, published by H. Edzes jr. in Groningen. Printed by lithographic printer N.V. W.R. Casparie & Zn.",
  },
  {
    id: "0817_00950",
    thumb: "0817_00950-1_0001.jpg",
    title: "Map of Groningen - 1 : 10,000",
    appLabel: "Bouma, c. 1922",
    date: "c. 1920-1925",
    scale: "1 : 10,000 / 1 : 50,000",
    creator: "S.J. Bouma, draftsman, Municipal Works",
    publisher: "VVV Groningen",
    technique: "Lithograph, colored",
    dimensions: "54 x 37 cm",
    hdl: "https://hdl.handle.net/21.12105/b6a4cf51-c4b6-b096-f0da-a8111d7060ac",
    description:
      "Tourist city map published by the VVV, with an additional walking map of the surrounding area and tram and bus routes. The reverse side contains tourist information in four languages.",
  },
  {
    id: "1536_1554",
    thumb: "1536_1554.jpg",
    title: "Groningen - City Center",
    appLabel: "VVV, c. 1930",
    date: "c. 1920-1940",
    scale: "1 : 10,000",
    publisher: "VVV Groningen",
    technique: "Color print",
    dimensions: "31 x 25 cm (folded: 25 x 11 cm)",
    hdl: "https://hdl.handle.net/21.12105/2f2ae1c5-3e1b-bc4e-1a6e-124d168fd428",
    description:
      "Compact city-center map published by the VVV, marking streets with one-way traffic. The reverse side lists road traffic rules.",
  },
];

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function InfoPage() {
  const locale = useLocale();
  const isEnglish = locale === "en";
  const maps = isEnglish ? MAPS_EN : MAPS_NL;
  const { proxyPath } = useProxyUrl();
  return (
    <div className="h-full flex flex-col" style={{ position: "relative" }}>
      <GlobalGrid />

      {/* z-10 so content sits above the GlobalGrid decorations */}
      <div className="relative z-10 flex flex-col h-full">
        <Header />

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto">
          <div
            className="mx-auto px-6 py-10"
            style={{ maxWidth: 860 }}
          >
            {/* ── Page title ────────────────────────────────────────────── */}
            <PageTitle isEnglish={isEnglish} />

            {/* ── About the project ─────────────────────────────────────── */}
            <Section label={isEnglish ? "About this project" : "Over dit project"}>
              {isEnglish ? (
                <>
                  <p>
                    This is a hobby project by{" "}
                    <strong className="text-bp-ink-bright">Lieuwe Jongsma</strong>,
                    who works at the Groninger Archieven. Its goal is to make the
                    1926 address book of the Municipality of Groningen searchable
                    and explorable on a map. The roughly 900 scanned pages were
                    processed with a combination of OCR and a vision-language
                    model, replacing most of the manual transcription work.
                  </p>
                  <p>
                    The source scans come from the collection of the{" "}
                    <a
                      href="https://groningsarchieven.nl"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      Groninger Archieven
                    </a>
                    . The address data has been linked to the Dutch Addresses and
                    Buildings Key Register (BAG) so the records can be placed on
                    the map. This is a work in progress: errors, gaps, and empty
                    pins will still be common.
                  </p>
                  <p>
                    Read more about the making of this project in{" "}
                    <a
                      href="https://www.lieuwejongsma.nl/mapping-groningens-1926-address-book/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      this blog post
                    </a>
                    . The source code is available on{" "}
                    <a
                      href="https://github.com/lieuwe89/groningen-adresboek-1926"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      GitHub
                    </a>
                    .
                  </p>
                  <p className="text-bp-ink-dim">
                    Questions or comments? Get in touch at{" "}
                    <a
                      href="mailto:lieuwe89@gmail.com"
                      className="text-bp-amber hover:underline"
                    >
                      lieuwe89@gmail.com
                    </a>
                    .
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Dit is een hobbyproject van{" "}
                    <strong className="text-bp-ink-bright">Lieuwe Jongsma</strong>,
                    werkzaam bij de Groninger Archieven. Het doel is om
                    het adresboek van de Gemeente Groningen uit 1926 doorzoekbaar en
                    ruimtelijk verkenbaar te maken. De ~900 gescande pagina's zijn
                    verwerkt met een combinatie van OCR en een vision-taalmodel, dat
                    de handmatige transcriptie grotendeels vervangt.
                  </p>
                  <p>
                    De bronscans zijn afkomstig uit de collectie van het{" "}
                    <a
                      href="https://groningsarchieven.nl"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      Groninger Archieven
                    </a>
                    . De adresgegevens zijn gekoppeld aan het Basisregister Adressen
                    en Gebouwen (BAG) om een plaatsje op de kaart te kunnen geven.
                    Dit is een werk in uitvoering — fouten, hiaten en lege pinnen
                    zullen nog ruimschoots aanwezig zijn.
                  </p>
                  <p>
                    Meer over de totstandkoming van dit project kun je lezen in{" "}
                    <a
                      href="https://www.lieuwejongsma.nl/mapping-groningens-1926-address-book/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      deze blogpost
                    </a>
                    . De broncode vind je op{" "}
                    <a
                      href="https://github.com/lieuwe89/groningen-adresboek-1926"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bp-amber hover:underline"
                    >
                      GitHub
                    </a>
                    .
                  </p>
                  <p className="text-bp-ink-dim">
                    Vragen of opmerkingen? Neem contact op via{" "}
                    <a
                      href="mailto:lieuwe89@gmail.com"
                      className="text-bp-amber hover:underline"
                    >
                      lieuwe89@gmail.com
                    </a>
                    .
                  </p>
                </>
              )}
            </Section>

            <Rule />

            {/* ── Why 1926? ─────────────────────────────────────────────── */}
            <Section label={isEnglish ? "Why 1926?" : "Waarom 1926?"}>
              {isEnglish ? (
                <>
                  <p>
                    The choice of 1926 is more or less arbitrary. The year falls
                    exactly a hundred years back and seemed like a good candidate
                    for testing the processing pipeline. The address book is fairly
                    complex in structure — some pages are particularly dense, with
                    many abbreviations in both occupations and street names, making
                    it an interesting challenge for automated recognition.
                  </p>
                  <p>
                    One advantage of 1926 over older editions: the addresses already
                    use the modern numbering system. Editions from before the late
                    nineteenth century followed a different system, for which
                    concordances exist. Converting historical numbers to modern
                    addresses using those concordances would have been an additional
                    step in the pipeline — a nice challenge for a future project.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    De keuze voor 1926 is min of meer toevallig. Het jaar valt
                    precies 100 jaar terug en leek een goede kandidaat om de
                    verwerkingspijplijn mee te testen. Het adresboek is qua
                    structuur vrij complex: sommige pagina's zijn bijzonder dicht,
                    met veel afkortingen in zowel beroepen als straatnamen. Dat
                    maakt het een interessante uitdaging voor automatische
                    herkenning.
                  </p>
                  <p>
                    Een voordeel van 1926 ten opzichte van oudere edities: de
                    adressen gebruiken al het moderne nummerstelsel. Voor edities
                    van vóór het einde van de negentiende eeuw gold een ander
                    stelsel, waarvoor concordanties bestaan. Het vertalen van
                    historische nummers naar moderne adressen met behulp van die
                    concordanties zou een extra stap in de pijplijn zijn geweest,
                    wat een mooie uitdaging is voor een toekomstig project.
                  </p>
                </>
              )}
            </Section>

            <Rule />

            {/* ── Why pins may be inaccurate ────────────────────────────── */}
            <Section label={isEnglish ? "Why might a pin be in the wrong place?" : "Waarom kan een pin verkeerd staan?"}>
              {isEnglish ? (
                <>
                  <p>
                    Even when an address is found in the current BAG register,
                    the pin is often not exactly right. There are several reasons
                    for this:
                  </p>
                  <ul>
                    <li>
                      <strong className="text-bp-ink-bright">Renumbering and redevelopment.</strong>{" "}
                      Streets were renumbered repeatedly during the twentieth
                      century. A house listed as number 12 in 1926 might now be
                      number 18, or the building may have been merged with its
                      neighbor and no longer exist as a separate address.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Demolished buildings.</strong>{" "}
                      Large parts of Groningen's city center were radically
                      redeveloped in the decades after the Second World War.
                      Many buildings from 1926 no longer stand, and the BAG does
                      not know these addresses.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Street name changes.</strong>{" "}
                      Some streets have different names today than they did in
                      1926. Matching uses the modern street name, so if the
                      historical name differs, the lookup can fail or choose the
                      wrong place.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">OCR and extraction errors.</strong>{" "}
                      Each address was read from a scanned page. Spaces, hyphens,
                      and special characters may differ from the actual spelling,
                      which can cause address matching to select the wrong
                      building.
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    Zelfs wanneer een adres wél gevonden wordt in het huidige BAG,
                    klopt de pin lang niet altijd precies. Dat heeft meerdere
                    oorzaken:
                  </p>
                  <ul>
                    <li>
                      <strong className="text-bp-ink-bright">Hernummering en herindeling.</strong>{" "}
                      Straten zijn in de loop van de twintigste eeuw herhaaldelijk
                      hernummerd. Een huis dat in 1926 als nummer 12 te boek stond,
                      kan nu nummer 18 zijn — of het pand is samengevoegd met een
                      buurpand en bestaat als zelfstandig adres niet meer.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Gesloopte bebouwing.</strong>{" "}
                      Grote delen van de Groningse binnenstad zijn in de decennia na
                      de Tweede Wereldoorlog ingrijpend gesaneerd. Veel panden uit
                      1926 staan er niet meer; het BAG kent deze adressen niet.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Straatnaamwijzigingen.</strong>{" "}
                      Sommige straten heten nu anders dan in 1926. De koppeling
                      gebeurt op de moderne straatnaam; wanneer de historische naam
                      afwijkt, kan de match missen of fout gaan.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">OCR- en extractiefouten.</strong>{" "}
                      Het adres is afgelezen van een gescande pagina. Spaties,
                      koppeltekens en bijzondere tekens kunnen bij de herkenning
                      afwijken van de werkelijke schrijfwijze, waardoor de
                      adresmatching soms het verkeerde pand vindt.
                    </li>
                  </ul>
                </>
              )}
            </Section>

            <Rule />

            {/* ── Why many records have no pin ─────────────────────────── */}
            <Section label={isEnglish ? "Why are many addresses not on the map?" : "Waarom staan veel adressen niet op de kaart?"}>
              {isEnglish ? (
                <>
                  <p>
                    A substantial share of the address book entries, estimated at{" "}
                    <strong className="text-bp-ink-bright">30-50%</strong>, cannot
                    be placed on the map with the current approach. The main
                    reasons are:
                  </p>
                  <ul>
                    <li>
                      <strong className="text-bp-ink-bright">The address no longer exists in the BAG.</strong>{" "}
                      Demolished buildings, discontinued street sections, and
                      vanished neighborhoods simply cannot be found in the current
                      address register.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Incomplete or illegible addresses.</strong>{" "}
                      Some entries contain only a street name without a house
                      number, or the house number was unreadable in the scan.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Historical spellings.</strong>{" "}
                      Street names were sometimes spelled differently in 1926
                      (for example, "Heereweg" versus "Hereweg"). Without a
                      manually curated translation table, the automatic matching
                      misses those cases. Such a table already exists, but it is
                      not complete yet.
                    </li>
                  </ul>
                  <p>
                    I plan to improve this step by step by comparing historical
                    address files with the current BAG data and manually building
                    a name translation table. That requires substantial archival
                    research, so it will take time.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Een aanzienlijk deel van de vermeldingen in het adresboek — naar
                    schatting{" "}
                    <strong className="text-bp-ink-bright">30–50 %</strong> — kan
                    met de huidige aanpak niet op de kaart worden geplaatst. De
                    voornaamste redenen:
                  </p>
                  <ul>
                    <li>
                      <strong className="text-bp-ink-bright">Het adres bestaat niet meer in het BAG.</strong>{" "}
                      Gesloopte panden, opgeheven straatdelen en verdwenen wijken
                      zijn simpelweg niet terug te vinden in de huidige
                      adresregistratie.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Onvolledige of onleesbare adressen.</strong>{" "}
                      Sommige vermeldingen bevatten alleen een straatnaam zonder
                      huisnummer, of het huisnummer was onleesbaar op de scan.
                    </li>
                    <li>
                      <strong className="text-bp-ink-bright">Historische schrijfwijzen.</strong>{" "}
                      Straatnamen werden in 1926 soms anders gespeld (bijv.
                      "Heereweg" versus "Hereweg"). Zonder handmatig gecureerde
                      vertaaltabel mist de automatische koppeling deze gevallen. Zo'n vertaaltabel is er al wel, maar nog niet compleet.
                    </li>
                  </ul>
                  <p>
                    Ik ben van plan dit stapsgewijs te verbeteren door historische
                    adresbestanden te vergelijken met de huidige BAG-data en
                    handmatig een naamsvertaling op te bouwen. Dit vergt echter
                    aanzienlijk archiefonderzoek, dus het zal tijd kosten.
                  </p>
                </>
              )}
            </Section>

            <Rule />

            {/* ── Historic map layers ───────────────────────────────────── */}
            <Section label={isEnglish ? "Historical map layers" : "Historische kaartlagen"}>
              {isEnglish ? (
                <p>
                  The map view offers six historical city maps as overlays. They
                  come from the collection of the Groninger Archieven and are
                  available digitally through{" "}
                  <a
                    href="https://beeldbankgroningen.nl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bp-amber hover:underline"
                  >
                    BeeldbankGroningen.nl
                  </a>
                  . The maps broadly date from the same period as the address
                  book (1915-1935) and show what Groningen looked like at the
                  time.
                </p>
              ) : (
                <p>
                  In de kaartweergave zijn zes historische stadsplattegronden
                  beschikbaar als overlay, afkomstig uit de collectie van het
                  Groninger Archieven en digitaal beschikbaar via{" "}
                  <a
                    href="https://beeldbankgroningen.nl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bp-amber hover:underline"
                  >
                    BeeldbankGroningen.nl
                  </a>
                  . De kaarten dateren globaal uit dezelfde periode als het
                  adresboek (1915–1935) en geven een beeld van Groningen zoals het
                  er indertijd uitzag.
                </p>
              )}

              <div className="mt-6 flex flex-col gap-6">
                {maps.map((m) => (
                  <MapCard key={m.id} map={m} proxyPath={proxyPath} isEnglish={isEnglish} />
                ))}
              </div>
            </Section>

            {/* Bottom padding */}
            <div style={{ height: 40 }} />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function PageTitle({ isEnglish }: { isEnglish: boolean }) {
  return (
    <div className="mb-8 flex items-start gap-4">
      <div>
        <div
          className="text-bp-ink-dim uppercase font-semibold"
          style={{ fontSize: 8.5, letterSpacing: "0.22em" }}
        >
          {isEnglish ? "Address Book 1926 - Municipality of Groningen" : "Adresboek 1926 — Gemeente Groningen"}
        </div>
        <h1
          className="text-bp-amber uppercase font-bold mt-1"
          style={{ fontSize: 20, letterSpacing: "0.22em", fontFamily: "var(--font-hand)" }}
        >
          {isEnglish ? "About this project" : "Over dit project"}
        </h1>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h2
        className="text-bp-amber uppercase font-bold mb-4"
        style={{ fontSize: 10, letterSpacing: "0.22em" }}
      >
        {label}
      </h2>
      <div
        className="text-bp-ink flex flex-col gap-3 leading-relaxed"
        style={{ fontSize: 13.5 }}
      >
        {children}
      </div>
    </section>
  );
}

function Rule() {
  return (
    <div
      className="my-7"
      style={{ height: 1, background: "linear-gradient(to right, #cfc39a33, #cfc39a66, #cfc39a33)" }}
    />
  );
}

/* eslint-disable @next/next/no-img-element */
function MapCard({
  map,
  proxyPath,
  isEnglish,
}: {
  map: MapProfile;
  proxyPath: (p: string) => string;
  isEnglish: boolean;
}) {
  const metaLabels = isEnglish
    ? {
        date: "Date",
        scale: "Scale",
        creator: "Creator",
        publisher: "Publisher",
        technique: "Technique",
        dimensions: "Dimensions",
      }
    : {
        date: "Datering",
        scale: "Schaal",
        creator: "Vervaardiger",
        publisher: "Uitgever",
        technique: "Techniek",
        dimensions: "Afmetingen",
      };

  return (
    <div
      style={{
        border: "1px solid #cfc39a28",
        background: "#0d1e3f88",
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 0,
      }}
    >
      {/* Thumbnail */}
      <a
        href={map.hdl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block",
          overflow: "hidden",
          background: "#091429",
          borderRight: "1px solid #cfc39a28",
        }}
      >
        <img
          src={proxyPath(`/map-thumbs/${map.thumb}`)}
          alt={map.title}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            filter: "sepia(0.25) contrast(0.95)",
            transition: "filter 200ms",
          }}
        />
      </a>

      {/* Metadata */}
      <div style={{ padding: "14px 18px" }}>
        {/* App label badge */}
        <div
          className="text-bp-ink-dim uppercase font-semibold mb-1"
          style={{ fontSize: 7.5, letterSpacing: "0.22em" }}
        >
          {map.appLabel}
        </div>

        {/* Title */}
        <div
          className="text-bp-ink-bright font-semibold mb-2"
          style={{ fontSize: 13, letterSpacing: "0.04em" }}
        >
          {map.title}
        </div>

        {/* Description */}
        <p
          className="text-bp-ink mb-3 leading-relaxed"
          style={{ fontSize: 12 }}
        >
          {map.description}
        </p>

        {/* Metadata grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "3px 12px",
            marginBottom: 12,
          }}
        >
          <MetaRow label={metaLabels.date} value={map.date} />
          <MetaRow label={metaLabels.scale} value={map.scale} />
          {map.creator && <MetaRow label={metaLabels.creator} value={map.creator} />}
          <MetaRow label={metaLabels.publisher} value={map.publisher} />
          <MetaRow label={metaLabels.technique} value={map.technique} />
          <MetaRow label={metaLabels.dimensions} value={map.dimensions} />
        </div>

        {/* Beeldbank link */}
        <a
          href={map.hdl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-[5px] text-bp-amber hover:underline uppercase font-bold"
          style={{ fontSize: 8.5, letterSpacing: "0.18em" }}
        >
          BeeldbankGroningen.nl
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span
        className="text-bp-ink-dim uppercase font-semibold"
        style={{ fontSize: 8.5, letterSpacing: "0.16em" }}
      >
        {label}
      </span>
      <span className="text-bp-ink" style={{ fontSize: 11.5 }}>
        {value}
      </span>
    </>
  );
}
