"use client";

import { useState } from "react";
import { FONT_CATALOG, fontBold, fontsHref } from "@/lib/fonts";

type Fonts = { title: string; subtitle: string; text: string };
const GROUPS = ["Destacadas", "Sans serif", "Serif", "Display"] as const;
const selectCls = "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const fam = (n: string) => `"${n}", system-ui, sans-serif`;

/** Elige las tres tipografías de la marca (títulos, subtítulos, texto) con vista previa en vivo y un catálogo para ver todas. */
export function FontPicker({ initial, color }: { initial: Fonts; color: string }) {
  const [f, setF] = useState<Fonts>(initial);
  const set = (k: keyof Fonts) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const options = (
    <>
      {GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {FONT_CATALOG.filter((x) => x.group === g).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
        </optgroup>
      ))}
    </>
  );

  return (
    <div className="space-y-5">
      <link rel="stylesheet" href={fontsHref(FONT_CATALOG.map((x) => x.name))} precedence="default" />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Títulos</span>
          <select name="fontTitle" value={f.title} onChange={set("title")} className={selectCls}>{options}</select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Subtítulos y frase</span>
          <select name="fontSubtitle" value={f.subtitle} onChange={set("subtitle")} className={selectCls}>{options}</select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Texto</span>
          <select name="fontText" value={f.text} onChange={set("text")} className={selectCls}>{options}</select>
        </label>
      </div>

      <div className="rounded-md border border-line bg-white p-4 text-gray-800">
        <p className="text-2xl" style={{ fontFamily: fam(f.title), fontWeight: fontBold(f.title), color }}>Título de ejemplo</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600" style={{ fontFamily: fam(f.subtitle) }}>Subtítulo de ejemplo</p>
        <p className="mt-2 text-sm" style={{ fontFamily: fam(f.text) }}>Texto de ejemplo para ver la tipografía. Este párrafo muestra cómo se lee. Esté seca al tacto.</p>
      </div>

      <details className="rounded-md border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-primary">Ver todas las tipografías disponibles</summary>
        <div className="mt-3 space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{g}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FONT_CATALOG.filter((x) => x.group === g).map((x) => (
                  <div key={x.name} className="rounded-md border border-line bg-white px-3 py-2 text-gray-800">
                    <p className="text-lg leading-tight" style={{ fontFamily: fam(x.name), fontWeight: x.bold }}>{x.name}</p>
                    <p className="text-xs text-gray-500" style={{ fontFamily: fam(x.name) }}>Aa Bb Cc 0123 — Texto de ejemplo</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
