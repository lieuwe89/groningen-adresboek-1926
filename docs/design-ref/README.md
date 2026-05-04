# Handoff: Groningen 1926 — Interactieve Adresboekverkenner

**Datum:** 2 mei 2026  
**Ontworpen in:** Claude / HTML prototype  
**Bestandsreferentie:** `Blueprint Directions v2.html`

---

## Overzicht

Een volledig schermvullende, interactieve verkenner van het Groninger adresboek uit 1926. De gebruiker kan zoeken op naam, beroep of adres in het historische naamregister, locaties bekijken op een gedigitaliseerde stadsplattegrond uit 1926, en de bijbehorende originele boekenscans raadplegen — alles in één geïntegreerde interface met een blauwdruk-esthetiek.

Het ontwerp is geïnspireerd op technische werktekeningen: inkt op blauwdrukpapier, millimetergrid, maatstrepen en een beperkt kleurenpalet van goudgeel (amber) op marineblauw.

---

## Over de ontwerpbestanden

De bestanden in dit pakket zijn **HTML-prototypes als ontwerpnaslagwerk** — ze tonen de bedoelde uitstraling en het gedrag, maar zijn geen productiecode die direct kan worden ingezet. De taak is om deze ontwerpen te **recreëren in de bestaande codebase** van het project (kies het meest passende framework als er nog geen bestaat) met de bestaande patronen en bibliotheken.

**Fideliteit: Hoog (hifi).** Dit is een pixel-accurate mockup met definitieve kleuren, typografie, maten en interacties. De developer dient de UI nauwkeurig te reproduceren.

---

## Architectuur: drie-paneel-layout

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER — titel, metadata, taalschakelaar                    │
├─────────────┬───────────────────────────┬────────────────────┤
│             │                           │                    │
│  ZOEKPANEL  │         KAART             │   SCANPANEL        │
│  (§ 1)      │         (§ 2)             │   (§ 3)            │
│  295px      │         flex: 1           │   325px            │
│  schuift ←  │                           │   schuift →        │
│             │                           │                    │
├─────────────┴───────────────────────────┴────────────────────┤
│  FOOTER — technische notatie                                 │
└──────────────────────────────────────────────────────────────┘
```

De zijpanelen schuiven open en dicht met een CSS-breedte-transitie (push-animatie: de kaart groeit/krimpt mee). Wanneer een paneel gesloten is, verschijnt er een kleine knop op de kaart om het te heropenen.

---

## Design Tokens

### Kleuren

| Token       | Hex         | Gebruik                                      |
|-------------|-------------|----------------------------------------------|
| `blue`      | `#182d5c`   | Achtergrond, panelen, kaartoverlay            |
| `blueMid`   | `#1a3060`   | Subtiele variatie achtergrond                |
| `ink`       | `#cfc39a`   | Primaire tekstkleur, grid, regels             |
| `inkBright` | `#e6d9b0`   | Naam-tekst, prominente labels                |
| `inkDim`    | `#7a7054`   | Secundaire tekst, labels, icoontjes          |
| `inkFaint`  | `#cfc39a18` | Subtiele achtergrondvullingen                |
| `amber`     | `#e8b84c`   | Accentkleur: actieve items, titels, markers  |
| `amberDim`  | `#e8b84c18` | Amber achtergrondvulling (hover, actief)     |
| `paper`     | `#f0e8d4`   | Achtergrond scanviewer                       |
| `paperInk`  | `#1a1208`   | Tekst op papier                              |

### Typografie

| Token  | Familie              | Gebruik                              |
|--------|----------------------|--------------------------------------|
| `font` | `Josefin Sans`       | Alle UI-tekst, labels, namen         |
| `hand` | `Special Elite`      | Decoratief, handgeschreven accenten  |

**Gewichten Josefin Sans:** 300 (light), 400 (regular), 600 (semibold), 700 (bold)  
**Bron:** Google Fonts — `https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&family=Special+Elite`

### Schaalverdeling tekst (px)

| Gebruik                     | Grootte | Gewicht | Letter-spacing |
|-----------------------------|---------|---------|----------------|
| Sectielabels (CAPS)         | 9       | 600     | 0.2em          |
| Naam in resultatenlijst     | 11      | 700     | 0.08em         |
| Beroep / secundair          | 8.5     | 400     | 0.08em         |
| Adres / metadata            | 8.5     | 400     | —              |
| Paginanummer (amber)        | 12      | 700     | 0.16em         |
| Header titel                | 15      | 700     | 0.28em         |
| Subkoptitels header         | 8.5     | 400/600 | 0.18–0.22em    |
| Kaart schaalnotatie         | 7       | 400     | 0.12em         |

### Spacing

- Standaard padding panelen: `13px` horizontaal
- Paneel-header padding: `5px 13px 4px`
- Resultaatrij padding: `10px 13px`
- Gap tussen header-metagegevens: `20px`
- Knoppen gap: `2px`

### Overgangen

```css
width:     320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)  /* paneel open/dicht */
opacity:   320ms cubic-bezier(0.25, 0.46, 0.45, 0.94)  /* knoppen fade */
transform: 0.15s ease-out                               /* kaart pan */
```

### Scheidingslijnen / Regels

- `height: 0.5px`, `background: #cfc39a`, `opacity: 0.15–0.25`
- Paneel-borders: `1px solid #cfc39a88`
- Actieve linker rand resultaatrij: `2px solid #e8b84c`

---

## Component: Header

**Hoogte:** ~68px (padding `10px 22px 8px`)  
**Border-bottom:** `1px solid #cfc39a88`

### Links (titeldeel)
- Supertitel: `"GEMEENTE GRONINGEN" — ADRESBOEK` — 8.5px, `#7a7054`, letter-spacing 0.22em, weight 600
- Hoofdtitel: `ADRESBOEK 1926` — 15px, `#e8b84c`, letter-spacing 0.28em, weight 700
- Subtitel: `INTERACTIEVE VERKENNER — NAAMREGISTER & PLATTEGROND` — 8.5px, `#e6d9b0`, letter-spacing 0.18em
- Metarij: drie label-waarde-paren (SCHAAL / SECTIE / BLAD), 7.5px + 8.5px, gap 20px

### Rechts
- Taalschakelaar NL/EN: twee knoppen, 9px, letter-spacing 0.18em, weight 700  
  — Actief: `border: 1px solid #e8b84c99`, kleur `#e8b84c`  
  — Inactief: `border: 1px solid #7a705444`, kleur `#7a7054`
- Coördinaten: `53°13′N  6°34′E` — 7.5px, `#7a7054`, letter-spacing 0.14em

---

## Component: Footer

**Hoogte:** 26px  
**Border-top:** `1px solid #cfc39a88`  
**Padding:** `0 22px`

- Links: `Technisch Bureau — Gemeente Groningen — 1926` — Label-stijl (9px, `#7a7054`, 0.2em)
- Rechts: `Nr. Grn/Adr/1926  —  21 Nov. 1926` — Label-stijl, kleur `#e8b84c`

---

## Component: Zoekpanel (§ 1 — Links)

**Breedte:** 295px (vaste interne breedte; animatie via wrapper)  
**Border-right:** `1px solid #cfc39a88`  
**Achtergrond:** `#182d5c`

### Animatie
De wrapper-div krijgt `width: 295px` of `width: 0` afhankelijk van `searchOpen`. `overflow: hidden` zorgt dat de inhoud wegknipt.

```css
.search-wrapper {
  width: /* 295px of 0 */;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

### Subcomponenten (top → bottom)

**1. Koptekst-rij**
- `§ 1  —  Zoekregister` — Label-stijl, amber
- ✕ sluitknop — 10px, `#7a7054`, cursor pointer

**2. Zoekveld**  
Padding `11px 13px`. Kader: `1px solid #e8b84c88`, achtergrond `#e8b84c08`.  
Decoratieve hoekmarkeringen: vier 5×5px vierkantjes op elke hoek (`border: 1px solid amber`, gevuld met `blue`).  
Inhoud: zoekicoontje (SVG, 12px, amber) + zoektekst (`BALK`) + cursor-blokje (1.5×13px, amber).

**3. Filterknoppen**  
Vier knoppen naast elkaar: `Alle` | `Namen` | `Straten` | `Beroepen`  
- Actief (Alle): `border: 1px solid #e8b84c88`, `background: #e8b84c10`, kleur amber
- Inactief: `border: 1px solid #7a705444`, transparant, kleur `#7a7054`
- Tekst 8px, letter-spacing 0.12em, weight 700

**4. Resultatenrij-header**  
Label "RESULTATEN" links + amber getal "28" rechts (10px, weight 700)

**5. Resultatenlijst**  
`flex: 1`, `overflow-y: auto`

Elke rij (`padding: 10px 13px`):
- Actieve rij: `background: #e8b84c0c`, `border-left: 2px solid #e8b84c`
- Inactieve rij: `border-left: 2px solid transparent`
- Naam: 11px, weight 700 (actief: amber) / weight 400 (inactief: `#e6d9b0`)
- Beroep: 8.5px, `#7a7054`
- Adres + paginanummer: flex row, space-between; paginanummer in kadertje (`0.5px solid #7a705455`, padding `1px 5px`)

**6. Footer**  
Label `Afd. I — Persoonsgegevens`

---

## Component: Kaart (§ 2 — Midden)

**Achtergrond:** flex: 1 (vult resterende breedte)  
**Kaartafbeelding:** `assets/map_1926.jpg`, `object-fit: cover`  
**CSS-filter:** `sepia(15%) brightness(0.9) saturate(0.85)`

### Interacties

**Slepen (pan):**  
- `mousedown` registreert startpositie
- `mousemove` updatet `pan.x` / `pan.y`
- `mouseup` / `mouseleave` stopt drag
- Transformatie: `transform: scale(zoom) translate(pan.x/zoom px, pan.y/zoom px)`

**Zoom:**  
- Standaard: `2.6×`, min `1×`, max `6×`, stap `0.4`
- Reset: zoom `2.6`, pan `{x: -38, y: -42}`

### SVG Blueprint-overlay (altijd bovenop de kaart, `pointer-events: none`)

**Grid patronen:**
- Fijn: 40×40px raster, lijnbreedte 0.3, opacity 0.12
- Grof: 200×200px raster, lijnbreedte 0.7, opacity 0.16

**Maatstrepen:**  
Op 10% intervallen langs alle vier randen, 7px lang, lijnbreedte 0.7, opacity 0.5

**Schaalbalk:**  
Vijf blokken (afwisselend gevuld/leeg) van 18px breed × 5px hoog, onderaan links (`y = height - 22`), labels "0" en "500 M"

**Markers** (twee typen):

*Cluster-marker* (meerdere adressen):
- 28×28px vierkant, blauw achtergrond, amber rand (1.2px)
- Vier uitstekende lijntjes (18px, amber, opacity 0.7)
- Wit getal in midden (9px, weight 700)

*Enkel-marker*:
- 10×10px ruit (45° gedraaid vierkant), amber rand 2px (inactief: ink 0.9px)
- Actief: extra ring 18×18px, amber 0.6px opacity 0.4 + stippellijn horizontaal

**Klik op marker:** roept `onMarkerClick(person)` aan → opent scanpanel met die persoon

**Callout-tooltip** (vast op actieve marker):
- Blueprint rechthoek (192×54px), `blue` achtergrond, amber rand
- Straatnaam: 7.5px amber, weight 700, letter-spacing 0.18em
- Naam: 9.5px `#e6d9b0`
- Beroep: 8px `#7a7054`
- Verbindingslijn: 3px naar boven

### Kaartbediening (rechtsonder)

Drie gestapelde knoppen (28×28px, 22px voor reset):
- Rand: `1px solid #e8b84c88`, achtergrond `#182d5cee`, kleur amber
- `+` zoom in / `⌖` reset / `−` zoom uit

Zoomniveau-indicator (rechtsonder, naast knoppen):  
`border: 1px solid #e8b84c55`, tekst `Z 2.6×`, 8px `#7a7054`

### Kaartlagen (linksonder) — `Kaartlagen`-paneel

Verticale stapel, gap 1px:
- Koptekst: `border: 1px solid #cfc39a44`, achtergrond `#182d5ccc`, Label amber
- Vier laag-rijen:

| id           | Label              | Standaard | Vergrendeld |
|--------------|--------------------|-----------|-------------|
| `historisch` | 1926 — Historisch  | aan       | ja (altijd aan) |
| `straten`    | Straten & namen    | aan       | nee         |
| `adressen`   | Adresmarkeringen   | aan       | nee         |
| `modern`     | Modern overlay     | uit       | nee         |

Elke rij: checkbox (9×9px vierkant, amber gevuld = aan), label 8.5px  
Actief: `border: 1px solid #e8b84c66`, achtergrond `#e8b84c0d`  
Inactief: `border: 1px solid #cfc39a33`, achtergrond `#182d5cbb`

### Zwevende knoppen op de kaart

**"Zoeken" knop** (linksboven op kaart):  
Zichtbaar alleen wanneer zoekpanel gesloten is (`opacity: 1` / `opacity: 0`, pointer-events mee).  
Kader amber, achtergrond `#182d5cee`, zoekicoontje + label.

**"Scan" knop** (rechtsboven op kaart):  
Zichtbaar alleen wanneer scanpanel gesloten is. Zelfde stijl, label + SVG icoontje.

---

## Component: Scanpanel (§ 3 — Rechts)

**Breedte:** 325px (vaste interne breedte; animatie via wrapper)  
**Border-left:** `1px solid #cfc39a88`  
**Achtergrond:** `#182d5c`

### Animatie (identiek aan zoekpanel)
```css
.scan-wrapper {
  width: /* 325px of 0 */;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 320ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

### Subcomponenten (top → bottom)

**1. Koptekst-rij**  
- `§ 3  —  Originele Scan` — Label-stijl, amber
- ✕ sluitknop rechts

**2. Persoonsgegevens-blok**  
Padding `9px 13px`, flexColumn, gap 4px:
- Subtitel: `Alphabetisch Naamregister` — 8px, `#7a7054`, weight 600
- Paginanummer: `Pagina {n}` — 12px, amber, weight 700, letter-spacing 0.16em
- Rij: NAAM + BEROEP (naast elkaar, gap 16px)
  - Label: 7.5px, `#7a7054`, letter-spacing 0.14em
  - Waarde: 10px, `#e6d9b0`, letter-spacing 0.08em
- ADRES onder: label + waarde amber 10px, letter-spacing 0.1em

**3. Scanweergave**  
`flex: 1`, achtergrond `#f0e8d4` (papierkleur)  
Afbeelding: `assets/scan_136.jpg`, `object-fit: cover`, `object-position: top left`  
Highlight-overlay: gele rechthoek op `top: 9%`, `left: 5%`, `width: 45%`, `height: 1.9%`  
Kleur: `#e8b84c44`, rand `1px solid #e8b84c`

**4. Pagina-navigator**  
Drie elementen: `← {n-1}` | Label `Blz {n} / 412` | `{n+1} →`  
Kleur `#7a7054`, 9.5px, cursor pointer

---

## Staatsbeheer (App-niveau)

```ts
searchOpen:   boolean   // zoekpanel zichtbaar
scanOpen:     boolean   // scanpanel zichtbaar
activePerson: Person    // momenteel geselecteerde persoon
layers: {
  historisch: boolean   // altijd true (vergrendeld)
  straten:    boolean
  adressen:   boolean
  modern:     boolean
}
```

### Staatstransities

| Actie                        | Resultaat                                      |
|------------------------------|------------------------------------------------|
| ✕ op zoekpanel               | `searchOpen = false`                           |
| Klik "Zoeken"-knop op kaart  | `searchOpen = true`                            |
| ✕ op scanpanel               | `scanOpen = false`                             |
| Klik "Scan"-knop op kaart    | `scanOpen = true`                              |
| Klik op marker met persoon   | `activePerson = person`, `scanOpen = true`     |
| Toggle kaartlaag             | `layers[id] = !layers[id]` (niet historisch)   |
| Zoom in/uit                  | `zoom ± 0.4`, clamp [1, 6]                     |
| Reset kaart                  | `zoom = 2.6`, `pan = {x: -38, y: -42}`        |

---

## Achtergrond-decoraties

**Globaal fijn grid** (SVG, `pointer-events: none`, `z-index: 0`):  
30×30px patroon, lijnbreedte 0.22, opacity 0.14, kleur `#cfc39a`

**Dubbele buitenrand** (SVG, over het gehele venster):  
- Buiten: `x=7 y=7`, 1px, opacity 0.55
- Binnen: `x=12 y=12`, 0.4px, opacity 0.28

---

## Assets

| Bestand              | Gebruik                            |
|----------------------|------------------------------------|
| `assets/map_1926.jpg`   | Historische plattegrond Groningen 1926 |
| `assets/scan_136.jpg`   | Scan adresboekpagina 136           |

---

## Bestanden in dit pakket

| Bestand                          | Beschrijving                            |
|----------------------------------|-----------------------------------------|
| `Blueprint Directions v2.html`   | Volledig hifi-prototype (React/Babel)   |
| `handoff/README.md`              | Dit document                            |
| `handoff/annotated-handoff.html` | Interactieve annotatie-viewer           |

---

## Opmerkingen voor de developer

1. **Lettertypen** moeten geladen worden voordat de UI rendert om FOUT (Flash Of Unstyled Text) te vermijden.
2. **SVG-overlay op de kaart** gebruikt `pointer-events: none` zodat drag-events de kaart bereiken. De markers zelf krijgen `pointer-events: all` terug.
3. De **breedte-animatie** van de zijpanelen vereist dat de inhoud een vaste breedte heeft die groter is dan de wrapper — nooit `width: 100%` op de binnenste div.
4. **Zoom/pan** transformatie werkt via `scale(zoom) translate(pan.x/zoom, pan.y/zoom)` — de deling door zoom compenseert voor de scale-transformatie zodat de verschuiving in schermcoördinaten consistent blijft.
5. De **kaartlaag "historisch"** is altijd ingeschakeld; geef geen toggle-handler mee voor dit item.
