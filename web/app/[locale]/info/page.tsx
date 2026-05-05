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

const MAPS: MapProfile[] = [
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

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function InfoPage() {
  const locale = useLocale();
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
            <PageTitle />

            {/* ── About the project ─────────────────────────────────────── */}
            <Section label="Over dit project">
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
            </Section>

            <Rule />

            {/* ── Why pins may be inaccurate ────────────────────────────── */}
            <Section label="Waarom kan een pin verkeerd staan?">
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
            </Section>

            <Rule />

            {/* ── Why many records have no pin ─────────────────────────── */}
            <Section label="Waarom staan veel adressen niet op de kaart?">
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
            </Section>

            <Rule />

            {/* ── Historic map layers ───────────────────────────────────── */}
            <Section label="Historische kaartlagen">
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

              <div className="mt-6 flex flex-col gap-6">
                {MAPS.map((m) => (
                  <MapCard key={m.id} map={m} proxyPath={proxyPath} />
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

function PageTitle() {
  return (
    <div className="mb-8 flex items-start gap-4">
      <div>
        <div
          className="text-bp-ink-dim uppercase font-semibold"
          style={{ fontSize: 8.5, letterSpacing: "0.22em" }}
        >
          Adresboek 1926 — Gemeente Groningen
        </div>
        <h1
          className="text-bp-amber uppercase font-bold mt-1"
          style={{ fontSize: 20, letterSpacing: "0.22em", fontFamily: "var(--font-hand)" }}
        >
          Over dit project
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
function MapCard({ map, proxyPath }: { map: MapProfile; proxyPath: (p: string) => string }) {
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
          <MetaRow label="Datering" value={map.date} />
          <MetaRow label="Schaal" value={map.scale} />
          {map.creator && <MetaRow label="Vervaardiger" value={map.creator} />}
          <MetaRow label="Uitgever" value={map.publisher} />
          <MetaRow label="Techniek" value={map.technique} />
          <MetaRow label="Afmetingen" value={map.dimensions} />
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
