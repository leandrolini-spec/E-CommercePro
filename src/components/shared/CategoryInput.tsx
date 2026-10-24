"use client";

import { useState } from "react";
import { categoryHue } from "./CategoryBadge";
import { Input } from "@/components/ui/primitives";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const dot = (name: string) => <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${categoryHue(name)} 65% 48%)` }} aria-hidden />;

/** Campo de categoría: se despliega con un botón y muestra las categorías que hay, cada una con su punto de color; también se puede escribir una nueva (su color se asigna solo). */
export function CategoryInput({ name, defaultValue = "", suggestions, required }: { name: string; defaultValue?: string; suggestions: string[]; required?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  // Sin repetidos (aunque difieran en mayúsculas o tildes).
  const seen = new Set<string>();
  const all = suggestions.filter((c) => c.trim() && !seen.has(norm(c)) && seen.add(norm(c))).sort((a, b) => a.localeCompare(b, "es"));
  const isNew = !!value.trim() && !all.some((c) => norm(c) === norm(value));
  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{value.trim() ? dot(value) : <span className="block h-2.5 w-2.5 rounded-full bg-line" />}</span>
          <Input name={name} value={value} required={required} onChange={(e) => { setValue(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} autoComplete="off" placeholder="Elegí una categoría o escribí una nueva" className="pl-8" />
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Ver las categorías" title="Ver las categorías" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted hover:bg-bg hover:text-ink">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m5 8 5 5 5-5" /></svg>
        </button>
      </div>
      {open && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {all.length === 0 && <li className="px-3 py-2 text-xs text-muted">Todavía no hay categorías: escribí la primera.</li>}
          {all.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => { setValue(c); setOpen(false); }} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-bg ${norm(c) === norm(value) ? "font-semibold" : ""}`}>{dot(c)}<span className="truncate">{c}</span></button>
            </li>
          ))}
        </ul>
      )}
      {isNew && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">{dot(value)}Se crea la categoría nueva «{value.trim()}» con su color.</p>}
    </div>
  );
}
