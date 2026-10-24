"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/overlays";

/** Botón chiquito de ojo que abre una tarjeta con datos de solo lectura. */
export function InfoCardButton({ title, label = "Ver datos", large = false, medium = false, children }: { title: string; label?: string; /** 32 px. */ medium?: boolean; /** Botón cuadrado de 36 px (igual que los demás de una tarjeta). */ large?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)} title={label} aria-label={label}
        className={`inline-flex items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:bg-bg hover:text-ink ${large ? "h-9 w-9" : medium ? "h-8 w-8" : "h-7 w-7"}`}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={large || medium ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden>
          <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" />
          <circle cx="10" cy="10" r="2.5" />
        </svg>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>{children}</Modal>
    </>
  );
}
