"use client";

import Link from "next/link";
import { useState } from "react";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Un solo botón con el mes elegido; al tocarlo se despliega un calendario de meses (por año). Solo se pueden elegir los meses con informe. */
export function MonthPicker({ selected, hrefs }: { selected: string; hrefs: Record<string, string> }) {
  const keys = Object.keys(hrefs).sort();
  const years = [...new Set(keys.map((k) => Number(k.slice(0, 4))))];
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(selected.slice(0, 4)));
  const label = `${MONTHS[Number(selected.slice(5, 7)) - 1]} ${selected.slice(0, 4)}`;
  const minY = Math.min(...years), maxY = Math.max(...years);
  return (
    <div className="relative inline-block" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" onClick={() => { setOpen((o) => !o); setYear(Number(selected.slice(0, 4))); }} aria-expanded={open}
        className="inline-flex h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-bg">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted" aria-hidden><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></svg>
        {label}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m5 8 5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" disabled={year <= minY} onClick={() => setYear((y) => y - 1)} aria-label="Año anterior" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink hover:bg-bg disabled:opacity-30">‹</button>
            <span className="text-sm font-semibold">{year}</span>
            <button type="button" disabled={year >= maxY} onClick={() => setYear((y) => y + 1)} aria-label="Año siguiente" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink hover:bg-bg disabled:opacity-30">›</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, "0")}`;
              const href = hrefs[key];
              const cls = "flex h-9 items-center justify-center rounded-md text-sm";
              return href ? (
                <Link key={key} href={href} onClick={() => setOpen(false)} className={`${cls} font-medium ${key === selected ? "bg-ink text-white" : "border border-line text-ink hover:bg-bg"}`}>{name.slice(0, 3)}</Link>
              ) : (
                <span key={key} className={`${cls} cursor-not-allowed text-muted/40`}>{name.slice(0, 3)}</span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
