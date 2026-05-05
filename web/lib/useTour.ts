"use client";

import { useCallback, useRef } from "react";
import Shepherd from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { useSelection } from "./SelectionContext";

export function useTour() {
  const tourRef = useRef<Shepherd.Tour | null>(null);
  const { setLayersOpen, setTourActive, setSearchOpen, setScanOpen } = useSelection();

  const startTour = useCallback(() => {
    // 1. Cleanup any existing tour instance
    if (tourRef.current) {
      tourRef.current.cancel();
      tourRef.current = null;
    }

    // 2. Initialize new tour
    const tour = new Shepherd.Tour({
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: "smooth", block: "center" },
      },
      useModalOverlay: true,
    });

    // 3. Mark tour as active (disables some UI hover effects)
    setTourActive(true);

    // Step 1: Welcome / Map Overview
    tour.addStep({
      id: "map",
      title: "De kaart",
      text: "Dit is de kaart van Groningen anno nu. De gemarkeerde gebouwen bevatten adressen uit het adresboek van 1926. Klik op een gebouw om te zien wie er woonde.",
      attachTo: { element: "#tour-map", on: "left" },
      buttons: [
        {
          text: "Volgende",
          action() { return this.next(); },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 2: Layers
    tour.addStep({
      id: "layers",
      title: "Kaartlagen",
      text: "Wissel hier tussen de moderne kaart en historische plattegronden uit de periode 1915–1935.",
      attachTo: { element: "#tour-layers-panel", on: "right" },
      beforeShowPromise: () => {
        setLayersOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: "Vorige",
          action() { 
            setLayersOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: "Volgende",
          action() { 
            setLayersOpen(false);
            return this.next(); 
          },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 3: Search
    tour.addStep({
      id: "search",
      title: "Zoeken",
      text: "Doorzoek het hele adresboek op naam, adres of beroep.",
      attachTo: { element: "#tour-search-panel", on: "right" },
      beforeShowPromise: () => {
        setSearchOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: "Vorige",
          action() { 
            setSearchOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: "Volgende",
          action() { 
            setSearchOpen(false);
            return this.next(); 
          },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 4: Scan
    tour.addStep({
      id: "scan",
      title: "Paginaweergave",
      text: "Bekijk de originele gescande pagina uit het adresboek van 1926.",
      attachTo: { element: "#tour-scan-panel", on: "left" },
      beforeShowPromise: () => {
        setScanOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: "Vorige",
          action() { 
            setScanOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: "Volgende",
          action() { 
            setScanOpen(false);
            return this.next(); 
          },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 5: Sections
    tour.addStep({
      id: "section",
      title: "Secties",
      text: "Navigeer snel naar het naamregister of het stratenregister.",
      attachTo: { element: "#tour-section", on: "bottom" },
      buttons: [
        {
          text: "Vorige",
          action() { return this.back(); },
          classes: "shepherd-button-secondary",
        },
        {
          text: "Volgende",
          action() { return this.next(); },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 6: Info
    tour.addStep({
      id: "info",
      title: "Project Info",
      text: "Hier vind je meer informatie over de bronnen en het proces achter dit project.",
      attachTo: { element: "#tour-info", on: "bottom" },
      buttons: [
        {
          text: "Vorige",
          action() { return this.back(); },
          classes: "shepherd-button-secondary",
        },
        {
          text: "Afronden",
          action() { return this.complete(); },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Event Listeners for State Cleanup
    const cleanup = () => {
      setTourActive(false);
      setLayersOpen(false);
      setSearchOpen(false);
      setScanOpen(false);
    };

    tour.on("complete", cleanup);
    tour.on("cancel", cleanup);

    // Save to ref and start
    tourRef.current = tour;
    tour.start();

  }, [setLayersOpen, setTourActive, setSearchOpen, setScanOpen]);

  return { startTour };
}
