import Link from "next/link";
import { ActionButton } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { MonthPicker } from "@/components/shared/MonthPicker";
import { fdate, int, money, pct, today } from "@/lib/format";
import { unifyCategory } from "@/modules/actions";
import { saleTotals } from "@/modules/calc";
import { cancelReasons, reasonLabel } from "@/modules/cancel-reasons";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import type { Db } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const OWN_CHANNELS = ["WhatsApp", "Instagram", "Campaña Meta", "Meta", "Tienda Nube", "Venta directa", "Web"];

type Line = { key: string; concept: string; amount: number; pct: number | null; note?: string; strong?: boolean };

/** Pestaña "Resultados" de Reportes: el estado de resultados del mes (lo que queda después de cargos, mercadería y gastos), la publicidad, las ventas caídas y los datos a revisar. */
export async function ResultadosTab({ db, mParam }: { db: Db; mParam: string }) {
  const monthsWithData = [...new Set([...db.sales.map((s) => s.date.slice(0, 7)), ...db.expenses.map((e) => e.date.slice(0, 7))])].sort();
  const cur = today().slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(mParam) ? mParam : cur;
  const hrefs = Object.fromEntries([...new Set([...monthsWithData, cur])].sort().map((k) => [k, `?tab=resultados&m=${k}`]));

  const sales = db.sales.filter((s) => s.date.slice(0, 7) === m && s.status !== "cancelada");
  const fell = db.sales.filter((s) => s.date.slice(0, 7) === m && (s.status === "cancelada" || s.payStatus === "reembolsada"));
  const tot = sales.map((s) => ({ s, t: saleTotals(db, s) }));
  const revenue = tot.reduce((a, x) => a + x.t.revenue, 0);
  const fees = tot.reduce((a, x) => a + x.t.fees, 0);
  const cogs = tot.reduce((a, x) => a + x.t.cost, 0);
  const exp = db.expenses.filter((e) => e.date.slice(0, 7) === m && e.kind !== "venta" && !e.kitStock);
  const sumCat = (re: RegExp) => exp.filter((e) => re.test(norm(e.category))).reduce((a, e) => a + e.amount, 0);
  const logistics = sumCat(/^logistica/), packaging = sumCat(/^packaging|^embalaje/), ads = sumCat(/^publicidad|^ads|^marketing|^meta/);
  const others = exp.reduce((a, e) => a + e.amount, 0) - logistics - packaging - ads;
  const result = revenue - fees - cogs - logistics - packaging - ads - others;
  const p = (v: number) => (revenue > 0 ? (v / revenue) * 100 : null);
  const lines: Line[] = [
    { key: "rev", concept: "Facturación bruta", amount: revenue, pct: revenue ? 100 : null, note: `${int(sales.length)} ventas sin las canceladas`, strong: true },
    { key: "fees", concept: "Cargos del canal (Mercado Libre y otros)", amount: -fees, pct: p(fees), note: "Bruto menos lo realmente cobrado" },
    { key: "cogs", concept: "Costo de la mercadería", amount: -cogs, pct: p(cogs), note: "Costo del producto × unidades vendidas" },
    { key: "gm", concept: "Margen bruto", amount: revenue - fees - cogs, pct: p(revenue - fees - cogs), strong: true },
    { key: "log", concept: "Logística", amount: -logistics, pct: p(logistics), note: logistics ? "Gastos de categoría Logística" : "No hay gastos de logística cargados este mes" },
    { key: "pack", concept: "Packaging", amount: -packaging, pct: p(packaging), note: "Gastos de categoría Packaging" },
    { key: "ads", concept: "Publicidad", amount: -ads, pct: p(ads), note: "Gastos de categoría Publicidad" },
    { key: "oth", concept: "Otros gastos de la empresa", amount: -others, pct: p(others), note: "Librería, combustible, servicios, comisiones…" },
    { key: "res", concept: "Resultado del mes", amount: result, pct: p(result), strong: true },
  ];

  // Por producto: los cargos de cada venta se reparten según lo que aportó cada producto.
  const byProd = new Map<string, { name: string; units: number; revenue: number; fees: number; cost: number }>();
  for (const { s, t } of tot) for (const i of s.items) {
    const prod = db.products.find((x) => x.id === i.productId);
    const rev = i.qty * i.unitPrice * (1 - i.discountPct / 100);
    const r = byProd.get(i.productId) ?? { name: prod?.name ?? "Producto", units: 0, revenue: 0, fees: 0, cost: 0 };
    r.units += i.qty; r.revenue += rev; r.cost += i.qty * (prod?.cost ?? 0); r.fees += t.revenue ? t.fees * (rev / t.revenue) : 0;
    byProd.set(i.productId, r);
  }
  const prodRows = [...byProd.entries()].map(([id, r]) => ({ id, ...r, margin: r.revenue - r.fees - r.cost })).sort((a, b) => b.revenue - a.revenue);

  // Cancelaciones con motivo.
  const reasons = isSupabase() ? await cancelReasons(await activeProjectId()).catch(() => new Map<string, string>()) : new Map<string, string>();
  const byReason = new Map<string, number>();
  for (const s of fell) byReason.set(reasons.get(s.id) ?? "", (byReason.get(reasons.get(s.id) ?? "") ?? 0) + 1);

  // Publicidad: gasto del mes y ventas de los canales propios (donde la publicidad trae compradores).
  const ownSales = sales.filter((s) => OWN_CHANNELS.includes(s.channel));

  // Datos a revisar.
  const noCost = prodRows.filter((r) => !(db.products.find((x) => x.id === r.id)?.cost));
  const tiny = db.expenses.filter((e) => e.amount > 0 && e.amount < 100);
  const groups = new Map<string, string[]>();
  for (const c of new Set(db.expenses.map((e) => e.category).filter(Boolean))) groups.set(norm(c), [...(groups.get(norm(c)) ?? []), c]);
  const used = (c: string) => db.expenses.filter((e) => e.category === c).length;
  const dups = [...groups.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => used(b) - used(a)));

  return (
    <div className="space-y-4">
      <MonthPicker selected={m} hrefs={hrefs} />
      <Guide title="¿Cómo se calcula el resultado?">Los gastos solo cuentan lo cargado en <Link href="/gastos" className="underline">Gastos</Link>: si falta alguno, el resultado real es menor. La mercadería se resta por el costo de cada producto, no por las compras, para no contarla dos veces.</Guide>
      <DataTable
        rows={lines} rowKey={(l) => l.key} rowClass={(l) => (l.strong ? "bg-bg font-semibold" : undefined)}
        columns={[
          { key: "c", header: "Concepto", render: (l: Line) => l.concept },
          { key: "a", header: "Monto", align: "right" as const, render: (l: Line) => <span className="tabular-nums">{l.amount < 0 ? "− " : ""}{money(Math.abs(l.amount))}</span> },
          { key: "p", header: "% de la venta", align: "right" as const, render: (l: Line) => (l.pct === null ? "—" : pct(Math.abs(l.pct))) },
          { key: "n", header: "De dónde sale", render: (l: Line) => <span className="text-xs text-muted">{l.note ?? ""}</span> },
        ]}
      />

      <h2 className="text-sm font-semibold">Publicidad</h2>
      <p className="text-sm text-muted">
        {ads > 0
          ? <>Gasto del mes: <strong className="text-ink">{money(ads)}</strong> · Ventas de canales propios (WhatsApp, Instagram, Meta, Tienda Nube): <strong className="text-ink">{int(ownSales.length)}</strong> por <strong className="text-ink">{money(ownSales.reduce((a, s) => a + saleTotals(db, s).revenue, 0))}</strong>
            {ownSales.length ? <> · Costo por venta: <strong className="text-ink">{money(ads / ownSales.length)}</strong> · Por cada $1 invertido entraron <strong className="text-ink">${(ownSales.reduce((a, s) => a + saleTotals(db, s).revenue, 0) / ads).toFixed(1).replace(".", ",")}</strong></> : null}.</>
          : <>No hay gastos de publicidad cargados este mes. Cargalos en Gastos con la categoría <strong className="text-ink">Publicidad</strong> y acá se calcula el costo por venta.</>}
      </p>

      <h2 className="text-sm font-semibold">Ventas caídas del mes ({int(fell.length)})</h2>
      <p className="text-sm text-muted">
        {fell.length === 0 ? "No hubo ventas caídas." : [...byReason.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${reasonLabel(code)}: ${n}`).join(" · ")}
        {fell.length > 0 ? <> · El motivo se anota en <Link href="/ventas?tab=reembolsar" className="underline">Ventas → Reembolsar</Link>.</> : null}
      </p>

      <h2 className="text-sm font-semibold">Datos a revisar</h2>
      <ul className="space-y-1.5 text-sm">
        {noCost.length === 0 && tiny.length === 0 && dups.length === 0 && <li className="text-muted">No hay nada raro en los datos de este mes.</li>}
        {noCost.length > 0 && <li><strong>Productos vendidos sin costo cargado</strong> (el margen sale inflado): {noCost.map((r) => r.name).join(", ")}. <Link href="/productos" className="underline">Cargar costos en Productos</Link></li>}
        {tiny.length > 0 && <li><strong>Gastos con un importe sospechosamente bajo</strong> (¿falta un cero?): {tiny.map((e) => `${e.description} (${money(e.amount)}, ${fdate(e.date)})`).join("; ")}. <Link href="/gastos" className="underline">Revisar en Gastos</Link></li>}
        {dups.map((g) => (
          <li key={g.join("|")} className="flex flex-wrap items-center gap-2">
            <span><strong>Categoría escrita de dos formas:</strong> {g.map((x) => `"${x}"`).join(" y ")}.</span>
            {g.slice(1).map((from) => <ActionButton key={from} action={unifyCategory.bind(null, from, g[0])} label={`Unificar "${from}" en "${g[0]}"`} />)}
          </li>
        ))}
      </ul>
    </div>
  );
}
