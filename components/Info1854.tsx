// Info page body for the 1854 book (the 1926 body lives in app/[locale]/info/page.tsx).
import type { ComponentType, ReactNode } from "react";

type Props = {
  isEnglish: boolean;
  Section: ComponentType<{ label: string; children: ReactNode }>;
  Rule: ComponentType;
};

const B = ({ children }: { children: ReactNode }) => <strong className="text-bp-ink-bright">{children}</strong>;

export default function Info1854({ isEnglish, Section, Rule }: Props) {
  if (isEnglish) {
    return (
      <>
        <Section label="About this project">
          <p>
            This is a hobby project by <B>Lieuwe Jongsma</B>, who works at the Groninger Archieven. It makes the{" "}
            <em>Adresboek of Naam-register van fabrijkanten, kooplieden, winkeliers, notarissen, makelaars, enz. te
            Groningen</em>, published in 1854 by J. Oomkens J.Zoon, searchable and puts it on the map.
          </p>
          <p>
            The book is not a list of residents. It is a trade directory: about 3,000 entries under more than 200
            occupations, from <em>Aannemers</em> to <em>Zoutzieders</em>. According to the preface it only lists
            the person who paid the business licence tax (<em>patentregt</em>) for a trade.
          </p>
        </Section>
        <Rule />
        <Section label="Ward letters and numbers">
          <p>
            In 1854 a Groningen address was a <B>ward letter and a number</B>, for example{" "}
            <em>Poelestraat D 85b</em>. Houses were numbered per ward, not per street. Around 1899 the city switched
            to the street numbering we still use.
          </p>
          <p>
            Each ward address is converted to a present-day address with{" "}
            <a className="text-bp-amber underline" href="https://grunnlink.lieuwejongsma.nl/omnummering">Grunnlink</a>,
            which is based on the <em>Omnummerboek</em> of 1899 (Groninger Archieven). In the page view you see both:
            the 1854 address, an arrow, and the address today.
          </p>
          <p>
            About three quarters of the entries are linked to a building on the map. For the rest only the street
            is known, or the ward was renumbered between 1854 and 1899, or the house no longer exists. A highlighted
            building marks the <B>place</B> of the 1854 address; the building itself is often younger.
          </p>
        </Section>
        <Rule />
        <Section label="How it was made">
          <p>
            The scans come from the Groninger Archieven. A vision-language model read every page and resolved the
            ditto marks and “Idem” lines of the original. The result was checked against the book’s own
            alphabetical name list. Errors remain; the scan is always the source.
          </p>
        </Section>
      </>
    );
  }
  return (
    <>
      <Section label="Over dit project">
        <p>
          Dit is een hobbyproject van <B>Lieuwe Jongsma</B>, werkzaam bij de Groninger Archieven. Het maakt het{" "}
          <em>Adresboek of Naam-register van fabrijkanten, kooplieden, winkeliers, notarissen, makelaars, enz. te
          Groningen</em>, in 1854 uitgegeven door J. Oomkens J.Zoon, doorzoekbaar en zet het op de kaart.
        </p>
        <p>
          Het boek is geen bewonerslijst. Het is een bedrijvengids: ongeveer 3.000 vermeldingen onder ruim 200
          beroepen, van <em>Aannemers</em> tot <em>Zoutzieders</em>. Volgens het voorbericht staat er alleen in wie
          voor een beroep of bedrijf in het <em>patentregt</em> was aangeslagen.
        </p>
      </Section>
      <Rule />
      <Section label="Wijkletters en nummers">
        <p>
          In 1854 bestond een Gronings adres uit een <B>wijkletter en een nummer</B>, bijvoorbeeld{" "}
          <em>Poelestraat D 85b</em>. Huizen waren per wijk genummerd, niet per straat. Rond 1899 stapte de stad over
          op de straatnummering die we nu nog gebruiken.
        </p>
        <p>
          Elk wijkadres rekenen we om naar een adres van nu met{" "}
          <a className="text-bp-amber underline" href="https://grunnlink.lieuwejongsma.nl/omnummering">Grunnlink</a>,
          dat steunt op het <em>Omnummerboek</em> van 1899 (Groninger Archieven). In de paginaweergave zie je beide:
          het adres van 1854, een pijl, en het adres van nu.
        </p>
        <p>
          Ongeveer driekwart van de vermeldingen is gekoppeld aan een gebouw op de kaart. Van de rest kennen we
          alleen de straat, is de wijk tussen 1854 en 1899 al eens omgenummerd, of bestaat het huis niet meer. Een
          gemarkeerd gebouw wijst de <B>plek</B> van het adres uit 1854 aan; het gebouw zelf is vaak jonger.
        </p>
      </Section>
      <Rule />
      <Section label="Hoe het gemaakt is">
        <p>
          De scans komen van de Groninger Archieven. Een beeld-taalmodel las elke pagina en loste daarbij de
          herhalingstekens en “Idem”-regels van het origineel op. De uitkomst is gecontroleerd tegen de alfabetische
          naamlijst achterin het boek. Er zitten nog fouten in; de scan is altijd de bron.
        </p>
      </Section>
    </>
  );
}
