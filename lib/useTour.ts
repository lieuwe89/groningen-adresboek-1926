"use client";

import { useCallback, useRef } from "react";
import { useSelection } from "./SelectionContext";
import { useTranslations } from 'next-intl';

export function useTour() {
  // shepherd.js v15 ships no TS declarations — typed as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tourRef = useRef<any>(null);
  const { setLayersOpen, setTourActive, setSearchOpen, setScanOpen } = useSelection();
  const t = useTranslations('Tour');

  const startTour = useCallback(async () => {
    // Shepherd only loads when the tour actually starts — keeps it out of the
    // main bundle. Its base CSS is imported globally in app/[locale]/layout.tsx.
    const { default: Shepherd } = await import("shepherd.js");

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
      title: t('map.title'),
      text: t('map.text'),
      attachTo: { element: "#tour-map", on: "left" },
      buttons: [
        {
          text: t('buttons.next'),
          action() { return this.next(); },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 2: Layers
    tour.addStep({
      id: "layers",
      title: t('layers.title'),
      text: t('layers.text'),
      attachTo: { element: "#tour-layers-panel", on: "right" },
      beforeShowPromise: () => {
        setLayersOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: t('buttons.prev'),
          action() { 
            setLayersOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: t('buttons.next'),
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
      title: t('search.title'),
      text: t('search.text'),
      attachTo: { element: "#tour-search-panel", on: "right" },
      beforeShowPromise: () => {
        setSearchOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: t('buttons.prev'),
          action() { 
            setSearchOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: t('buttons.next'),
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
      title: t('scan.title'),
      text: t('scan.text'),
      attachTo: { element: "#tour-scan-panel", on: "left" },
      beforeShowPromise: () => {
        setScanOpen(true);
        return Promise.resolve();
      },
      buttons: [
        {
          text: t('buttons.prev'),
          action() { 
            setScanOpen(false);
            return this.back(); 
          },
          classes: "shepherd-button-secondary",
        },
        {
          text: t('buttons.next'),
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
      title: t('section.title'),
      text: t('section.text'),
      attachTo: { element: "#tour-section", on: "bottom" },
      buttons: [
        {
          text: t('buttons.prev'),
          action() { return this.back(); },
          classes: "shepherd-button-secondary",
        },
        {
          text: t('buttons.next'),
          action() { return this.next(); },
          classes: "shepherd-button-primary",
        },
      ],
    });

    // Step 6: Info
    tour.addStep({
      id: "info",
      title: t('info.title'),
      text: t('info.text'),
      attachTo: { element: "#tour-info", on: "bottom" },
      buttons: [
        {
          text: t('buttons.prev'),
          action() { return this.back(); },
          classes: "shepherd-button-secondary",
        },
        {
          text: t('buttons.finish'),
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

  }, [setLayersOpen, setTourActive, setSearchOpen, setScanOpen, t]);

  return { startTour };
}
