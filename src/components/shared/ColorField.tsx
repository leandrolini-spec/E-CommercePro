"use client";

import { useState } from "react";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Color de la marca: se elige con el selector o se escribe/pega el código (#RRGGBB). Envía el valor en el campo `name`. */
export function ColorField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [text, setText] = useState(defaultValue);
  const valid = HEX.test(text);

  function change(v: string) {
    let t = v.trim();
    if (t && !t.startsWith("#")) t = `#${t}`;
    setText(t.slice(0, 7));
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="color" value={valid ? text.toLowerCase() : defaultValue} onChange={(e) => setText(e.target.value)} aria-label="Elegir color"
          className="h-9 w-14 shrink-0 cursor-pointer rounded border border-line bg-surface p-1"
        />
        <input
          name={name} value={text} onChange={(e) => change(e.target.value)} maxLength={7} spellCheck={false} autoComplete="off" placeholder="#16a34a" aria-label="Código del color"
          className={`w-32 rounded-md border bg-surface px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 ${valid ? "border-line focus:border-primary focus:ring-primary/20" : "border-danger focus:ring-danger/20"}`}
        />
      </div>
      {!valid && <p className="mt-1 text-xs text-danger">Escribí un código de 6 letras o números, por ejemplo #16a34a.</p>}
    </div>
  );
}
