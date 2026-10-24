"use client";

import { useState } from "react";
import { categoryHue } from "./CategoryBadge";

export type DotOption = { value: string; label: string; /** Categoría cuyo color se muestra como puntito. */ dot?: string };
const dot = (cat?: string) => (cat?.trim() ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${categoryHue(cat)} 65% 48%)` }} aria-hidden /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-line" aria-hidden />);

/** Desplegable con un puntito de color en cada opción (el color de su categoría). */
export function DotSelect({ name, options, defaultValue = "", required, placeholder = "Elegir…" }: { name: string; options: DotOption[]; defaultValue?: string; required?: boolean; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <input type="hidden" name={name} value={value} />
      {/* Campo oculto para que "obligatorio" funcione igual que en un desplegable común. */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="pointer-events-none absolute inset-0 h-full w-full opacity-0" />}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-10 w-full items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-left text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
        {cur ? dot(cur.dot) : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-line" aria-hidden />}
        <span className={`flex-1 truncate ${cur && cur.value ? "" : "text-muted"}`}>{cur && cur.value ? cur.label : placeholder}</span>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m5 8 5 5 5-5" /></svg>
      </button>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {!required && (
            <li><button type="button" onClick={() => { setValue(""); setOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-muted hover:bg-bg">{dot()}<span>{placeholder}</span></button></li>
          )}
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" onClick={() => { setValue(o.value); setOpen(false); }} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-bg ${o.value === value ? "font-semibold" : ""}`}>{dot(o.dot)}<span className="truncate">{o.label}</span></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
