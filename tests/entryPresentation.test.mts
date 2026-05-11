import assert from "node:assert/strict";
import test from "node:test";

import { presentEntry } from "../lib/entryPresentation.ts";

test("presentEntry keeps normal residents in the person display model", () => {
  const display = presentEntry({
    section: "name_register",
    name: "Jansen",
    initials: "P.",
    occupation: "bakker",
    address_full: "A-straat 1",
  });

  assert.equal(display.kind, "person");
  assert.equal(display.badge, null);
  assert.equal(display.title, "Jansen P.");
  assert.equal(display.detailLabel, "Beroep");
  assert.equal(display.detail, "bakker");
  assert.equal(display.showMapStatus, true);
});

test("presentEntry renders institutional people by role and parent context", () => {
  const display = presentEntry({
    section: "institutional",
    entity_type: "person",
    name: "J. Bomers",
    role: "Gemeenteontvanger",
    parent_organization: "Kantoor van den Gemeenteontvanger",
  });

  assert.equal(display.kind, "institutional");
  assert.equal(display.badge, "Instelling");
  assert.equal(display.detailLabel, "Rol");
  assert.equal(display.detail, "Gemeenteontvanger");
  assert.equal(display.subtitle, "Gemeenteontvanger / Kantoor van den Gemeenteontvanger");
  assert.equal(display.showMapStatus, false);
});

test("presentEntry treats business-like name register entries as organizations", () => {
  const display = presentEntry({
    section: "name_register",
    name: "N.V. Utrechtsche Asphaltfabriek",
    occupation: "voorheen Firma Stein & Takken",
    address_full: "Oosterhaven 1",
  });

  assert.equal(display.kind, "organization");
  assert.equal(display.badge, "Organisatie");
  assert.equal(display.detailLabel, "Context");
  assert.equal(display.detail, "voorheen Firma Stein & Takken");
});

test("presentEntry does not promote people to organizations from occupation text alone", () => {
  const display = presentEntry({
    section: "name_register",
    name: "Berge",
    initials: "Jan",
    occupation: "Firma H. L. Swarte",
    address_full: "A-straat 1",
  });

  assert.equal(display.kind, "person");
  assert.equal(display.badge, null);
  assert.equal(display.detailLabel, "Beroep");
  assert.equal(display.detail, "Firma H. L. Swarte");
});

test("presentEntry honors explicit admin organization corrections", () => {
  const display = presentEntry({
    section: "name_register",
    entity_type: "organization",
    name: "Eerste Gron. Betonbouw (N.V.)",
    address_full: "Damsterdiep 1",
  });

  assert.equal(display.kind, "organization");
  assert.equal(display.badge, "Organisatie");
});

test("presentEntry gives advertisements their own display model", () => {
  const display = presentEntry({
    section: "advertisement",
    name: "P. Daniels",
    address_full: "Vischmarkt 40a",
    notes: "Beleefd aanbevelend",
  });

  assert.equal(display.kind, "advertisement");
  assert.equal(display.badge, "Advertentie");
  assert.equal(display.detailLabel, "Beschrijving");
  assert.equal(display.detail, "Beleefd aanbevelend");
});
