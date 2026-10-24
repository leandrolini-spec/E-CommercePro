import Link from "next/link";
import { fdate, today } from "@/lib/format";
import { periodRange, type Period } from "@/modules/calc";
import type { Db } from "@/modules/types";
import { param, type SearchParams } from "./list";

/** Botones de período de Gastos, Compras e Insumos: los mismos en las tres solapas. */
export const SPAN_TABS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Esta semana"], ["15", "Últimos 15 días"], ["mes", "Este mes"], ["mes-anterior", "Mes anterior"], ["6m", "Últimos 6 meses"], ["anio", "Este año"], ["todo", "Todo el historial"]] as const;

/** Lunes de la semana de una fecha (AAAA-MM-DD). */
const weekStart = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Rango elegido: fechas "Desde/Hasta" (si se cargó alguna) o el botón de período. Sin nada, todo el historial. */
export function rangeOf(sp: SearchParams) {
  const f = param(sp, "from"), t = param(sp, "to");
  if (f || t) {
    const from = f || "2000-01-01", to = t || today();
    return { key: "", from, to, label: `${f ? fdate(f) : "el principio"} al ${t ? fdate(t) : fdate(today())}` };
  }
  const key = SPAN_TABS.find((x) => x[0] === param(sp, "ip"))?.[0] ?? "todo";
  if (key === "todo") return { key, from: "2000-01-01", to: today(), label: `Todo el historial (hasta el ${fdate(today())})` };
  const r = key === "semana" ? { from: weekStart(today()), to: today() } : periodRange(key as Period);
  return { key, ...r, label: `${SPAN_TABS.find((x) => x[0] === key)![1]}: ${r.from === r.to ? fdate(r.from) : `${fdate(r.from)} al ${fdate(r.to)}`}` };
}

/** Copia de los datos con solo lo del período (para totales y balance). */
export function inRangeDb(db: Db, from: string, to: string): Db {
  const within = <T extends { date: string }>(l: T[]) => l.filter((x) => x.date.slice(0, 10) >= from && x.date.slice(0, 10) <= to);
  return { ...db, sales: within(db.sales), expenses: within(db.expenses), cash: within(db.cash), purchases: within(db.purchases), advances: within(db.advances ?? []) };
}

/** Dirección que conserva todos los filtros y cambia solo lo indicado ("" quita el parámetro). */
export function hrefWith(sp: SearchParams, extra: Record<string, string>, drop: string[] = ["page"]) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && !drop.includes(k)) u.set(k, Array.isArray(v) ? v[0] : v);
  for (const [k, v] of Object.entries(extra)) { if (v) u.set(k, v); else u.delete(k); }
  return `?${u}`;
}

export function PeriodTabs({ sp }: { sp: SearchParams }) {
  const cur = rangeOf(sp).key;
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Período">
      {SPAN_TABS.map(([k, label]) => (
        <Link key={k} href={hrefWith(sp, { ip: k === "todo" ? "" : k, from: "", to: "" })} className={`rounded-full border px-3 py-1 text-sm ${k === cur ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
      ))}
    </nav>
  );
}
