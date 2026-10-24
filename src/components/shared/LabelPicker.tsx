"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type LabelRow = {
  id: string; customer: string; address: string; city: string; carrier: string; external: boolean; channel: string; orderRef: string;
  stageId: string; stageName: string; date: string; final: boolean; missing: string[];
};

/** Lista de envíos para elegir cuáles etiquetas imprimir: cada una sale sola en su formato (logística o Vía Cargo y similares). */
export function LabelPicker({ rows, stages, preselect }: { rows: LabelRow[]; stages: { id: string; name: string }[]; preselect: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(preselect));
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [fmt, setFmt] = useState<"a4" | "10x15">("a4");
  const [showDone, setShowDone] = useState(false);

  const shown = useMemo(() => rows.filter((r) =>
    (showDone || !r.final || sel.has(r.id)) && (!stage || r.stageId === stage) &&
    (!q || `${r.customer} ${r.address} ${r.city} ${r.orderRef} ${r.carrier} ${r.channel}`.toLowerCase().includes(q.toLowerCase())),
  ), [rows, q, stage, showDone, sel]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((s) => { const n = new Set(s); if (allShown) shown.forEach((r) => n.delete(r.id)); else shown.forEach((r) => n.add(r.id)); return n; });
  const chosen = rows.filter((r) => sel.has(r.id));
  const href = `/etiquetas/imprimir?ids=${encodeURIComponent(chosen.map((r) => r.id).join(","))}&f=${fmt}`;
  const incomplete = chosen.filter((r) => r.missing.length).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, dirección, localidad o número de compra" className="h-10 min-w-56 flex-1 rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm">
          <option value="">Etapa: todas</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="inline-flex h-10 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-black" />Mostrar entregados</label>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-sm">
        <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={allShown} onChange={toggleAll} className="h-4 w-4 accent-black" />Elegir todos los que se ven ({shown.length})</label>
        <div className="flex flex-wrap items-center gap-2">
          <select value={fmt} onChange={(e) => setFmt(e.target.value as "a4" | "10x15")} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" aria-label="Formato de papel">
            <option value="a4">Hoja A4 (4 por hoja)</option>
            <option value="10x15">Etiqueta 10 × 15 cm</option>
          </select>
          {chosen.length > 0 ? (
            <Link href={href} className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white hover:opacity-90">Imprimir {chosen.length} etiqueta{chosen.length === 1 ? "" : "s"}</Link>
          ) : (
            <span className="inline-flex h-10 cursor-not-allowed items-center rounded-md bg-line px-4 text-sm font-semibold text-muted">Elegí al menos un envío</span>
          )}
        </div>
        {incomplete > 0 && <p className="w-full text-xs font-medium text-danger">{incomplete} de las elegidas tiene datos incompletos: en la hoja quedan líneas en blanco. Podés completarlos antes con Editar en Envíos.</p>}
      </div>

      <ul className="space-y-2">
        {shown.length === 0 && <li className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">No hay envíos con esos filtros.</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${sel.has(r.id) ? "border-ink bg-bg" : "border-line bg-surface hover:bg-bg"}`}>
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-4 w-4 shrink-0 accent-black" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.customer || "Sin nombre"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.external ? "bg-[#0891b2]/15 text-[#0e7490]" : "bg-[#16a34a]/15 text-[#15803d]"}`}>{r.external ? `Formato ${r.carrier}` : "Formato logística"}</span>
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-medium text-muted">{r.stageName}</span>
                  {r.missing.length > 0 && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">Falta: {r.missing.join(", ")}</span>}
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted">{[r.address, r.city].filter(Boolean).join(" · ") || "Sin dirección"}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{[r.channel === "Mercado Libre" || r.channel === "Tienda Nube" ? r.channel : "", r.orderRef ? `Compra ${r.orderRef}` : "", r.date].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
