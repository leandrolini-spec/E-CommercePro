"use client";

import { useState, type ReactNode } from "react";

/** Botón que abre un panel con un formulario. Se cierra con el mismo botón o con "Cerrar sin guardar": no hay que guardar para salir. */
export function TogglePanel({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 max-md:w-full text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover">
        {icon}{label}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m5 8 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="mt-3">
          <div className="mb-2 flex justify-center md:justify-end">
            <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-xs font-medium text-muted hover:bg-bg hover:text-ink">✕ Cerrar sin guardar</button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
