"use client";

import { useEffect, useState } from "react";

interface WelcomeModalProps {
  onStartTour: () => void;
}

const STORAGE_KEY = "grn1926-welcome-dismissed";

export default function WelcomeModal({ onStartTour }: WelcomeModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== "1") {
      setIsOpen(true);
    }
  }, []);

  const handleClose = (startTour: boolean) => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setIsOpen(false);
    if (startTour) {
      onStartTour();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-bp-blue/80 backdrop-blur-sm">
      <div 
        className="relative w-full max-w-lg bg-bp-blue border border-bp-amber/40 shadow-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d1e3f 0%, #091429 100%)" }}
      >
        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none opacity-20">
          <div className="absolute top-4 right-4 w-full h-full border-t border-r border-bp-amber" />
        </div>

        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 
              className="text-bp-amber uppercase font-bold text-xl tracking-widest"
              style={{ fontFamily: "var(--font-hand), cursive" }}
            >
              Welkom bij het Adresboek 1926
            </h2>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold text-bp-amber border border-bp-amber/40 px-2 py-0.5 opacity-50">NL</span>
              <span className="text-[10px] font-bold text-bp-ink-dim border border-bp-ink-dim/20 px-2 py-0.5 hover:text-bp-amber hover:border-bp-amber/40 cursor-pointer transition-colors">EN</span>
            </div>
          </div>

          <div className="space-y-4 text-bp-ink leading-relaxed text-sm mb-8">
            <p>
              Dit is een hobbyproject van <span className="text-bp-ink-bright font-semibold">Lieuwe Jongsma</span> (Groninger Archieven). 
              Het doel is om het Groningse adresboek uit 1926 op een interactieve manier doorzoekbaar en ruimtelijk verkenbaar te maken.
            </p>
            <p className="text-bp-ink-dim italic border-l-2 border-bp-amber/20 pl-4 py-1">
              Let op: Dit is een werk in uitvoering. De koppeling tussen adressen en locaties op de kaart kan fouten of hiaten bevatten door historische hernummeringen of extractieverschillen.
            </p>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="peer sr-only"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                <div className="w-4 h-4 border border-bp-amber/40 group-hover:border-bp-amber transition-colors" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity">
                  <div className="w-2 h-2 bg-bp-amber" />
                </div>
              </div>
              <span className="text-[11px] uppercase font-bold text-bp-ink-dim tracking-wider group-hover:text-bp-ink transition-colors">
                Niet weer laten zien
              </span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => handleClose(true)}
              className="flex-1 bg-bp-amber text-bp-blue font-bold uppercase tracking-widest py-3 px-6 hover:bg-bp-amber-light transition-colors text-xs"
            >
              Rondleiding starten
            </button>
            <button 
              onClick={() => handleClose(false)}
              className="flex-1 border border-bp-amber/40 text-bp-amber font-bold uppercase tracking-widest py-3 px-6 hover:bg-bp-amber/10 transition-colors text-xs"
            >
              Overslaan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
