"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

/** Número de stock que se cambia tocándolo: se escribe la cantidad nueva y Enter (o el tilde) la guarda. */
export function StockInline({ value, unlimited, action }: { value: number; unlimited: boolean; action: (fd: FormData) => Promise<void | { error: string }> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function save(mode: "cantidad" | "infinito") {
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("stock", text.trim());
    fd.set("reason", "Ajuste de stock (conteo)");
    setError(null);
    start(async () => {
      try {
        const r = await action(fd);
        if (r && typeof r === "object" && "error" in r) { setError(r.error); return; }
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "No se pudo guardar.");
      }
    });
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => { setText(unlimited ? "0" : String(value)); setError(null); setEditing(true); }} title="Tocá para cambiar el stock"
        className="min-w-12 rounded-md border border-transparent px-2.5 py-1 text-base font-semibold hover:border-line hover:bg-bg">
        {unlimited ? <span className="text-2xl leading-none text-primary">∞</span> : value}
      </button>
    );
  }
  const unchanged = !unlimited && text.trim() === String(value);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          ref={input} autoFocus type="number" min={0} step={1} inputMode="numeric" value={text} disabled={pending} aria-label="Cuántas unidades hay ahora"
          onChange={(e) => setText(e.target.value)} onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (unchanged) setEditing(false); else save("cantidad"); } if (e.key === "Escape") setEditing(false); }}
          className="h-9 w-20 rounded-md border border-primary bg-surface px-2 text-right text-base font-semibold outline-none ring-2 ring-primary/20"
        />
        <button type="button" disabled={pending} onClick={() => (unchanged ? setEditing(false) : save("cantidad"))} title="Guardar" aria-label="Guardar el stock" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink text-white hover:opacity-90">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
        </button>
        {!unlimited && (
          <button type="button" disabled={pending} onClick={() => save("infinito")} title="Pasar a stock infinito" aria-label="Pasar a stock infinito" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-lg hover:bg-bg">∞</button>
        )}
        <button type="button" disabled={pending} onClick={() => setEditing(false)} title="Cancelar" aria-label="Cancelar" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted hover:bg-bg">✕</button>
      </div>
      {error && <p className="max-w-52 text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
