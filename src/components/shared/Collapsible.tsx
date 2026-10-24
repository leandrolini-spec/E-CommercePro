"use client";

import { useState, type ReactNode } from "react";

/** Desplegable que se abre y se cierra con el mismo botón (el estado lo maneja la pantalla, no el navegador). */
export function Collapsible({ title, children, className = "" }: { title: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-md border border-line bg-bg/60 text-xs ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium">
        <span>{title}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m5 8 5 5 5-5" /></svg>
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </div>
  );
}
