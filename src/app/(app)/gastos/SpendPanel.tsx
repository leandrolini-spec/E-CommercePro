import { CategoryBadge } from "@/components/shared/CategoryBadge";
import Link from "next/link";
import type { ReactNode } from "react";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/primitives";
import { fdate, int, money } from "@/lib/format";
import { updateProduct } from "@/modules/actions";
import { hrefWith, PeriodTabs, rangeOf } from "@/components/shared/period";
import { MERCH_CATEGORIES } from "@/modules/expenses";
import type { Db, Product } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const GROUPS = [["item", "Por insumo"], ["categoria", "Por categoría"], ["mes", "Por mes"], ["semana", "Por semana"]] as const;

type Mode = "insumos" | "compras";
/** Textos de cada panel: el mismo análisis sirve para los insumos de la empresa y para las compras de mercadería. */
const TEXT: Record<Mode, { total: string; top: string; topCat: string; totalCol: string; most: string; item: string; items: string; first: string; empty: string; intro: string }> = {
  insumos: {
    total: "Total gastado en insumos", top: "Insumo que más gasto genera", topCat: "Categoría que más gasta", totalCol: "Total gastado", most: "Más consumido", item: "Insumo", items: "Insumos", first: "Por insumo",
    empty: "Sin compras de insumos en este período", intro: "Todo lo que la empresa gasta y no se vende: embalaje, combustible, librería, logística, servicios (Tienda Nube, dominio, contador)… No llevan stock. Lo que cargues en la solapa Gastos aparece acá solo, y las categorías nuevas se suman solas.",
  },
  compras: {
    total: "Total invertido en compras", top: "Producto que más inversión genera", topCat: "Categoría que más invierte", totalCol: "Total invertido", most: "Más comprado", item: "Producto", items: "Productos", first: "Por producto",
    empty: "Sin compras de mercadería en este período", intro: "Mercadería que se compra para vender: productos, macetas, herramientas, semillas… Lo que cargues en Gastos como “para vender” aparece acá solo y suma stock.",
  },
};

/** Lunes de la semana de una fecha (AAAA-MM-DD). */
const weekStart = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Separa un nombre en título y detalle: "Caja grande 60 × 30 × 15 cm" → "Caja grande" y "60 × 30 × 15 cm". */
const splitName = (name: string) => {
  const m = name.trim().match(/^(.+?)\s+(\d.*|\(.*)$/);
  return m ? { title: m[1], detail: m[2] } : { title: name.trim(), detail: "" };
};

type Row = { key: string; cells: ReactNode[]; total?: boolean };

/**
 * Insumos de la empresa: cuánto se gasta y qué se consume más, por insumo, categoría, mes o semana, con total y filtros de período.
 * Sale de las compras de insumos (las mismas que se anotan en Gastos).
 */
const PENCIL = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M13.6 2.9a1.8 1.8 0 0 1 2.5 2.5l-.9.9-2.5-2.5.9-.9ZM11.8 4.7l-7.5 7.5a1 1 0 0 0-.26.45l-.8 3a.5.5 0 0 0 .6.6l3-.8a1 1 0 0 0 .45-.26l7.5-7.5-2.99-2.99Z" /></svg>;

export function SpendPanel({ db, sp, mode, detail }: { db: Db; sp: SearchParams; mode: Mode; detail?: ReactNode }) {
  const t = TEXT[mode];
  const supplies = db.products.filter((p) => (mode === "insumos" ? p.kind === "consumible" : p.kind !== "consumible"));
  const pencil = PENCIL;
  const editFields = (p: Product) => [
    { name: "name", label: "Nombre", required: true, defaultValue: p.name },
    { name: "sku", label: "Código", required: true, defaultValue: p.sku },
    { name: "category", label: "Elegí una categoría", type: "category" as const, defaultValue: p.category, suggestions: [...new Set([...db.settings.expenseCategories, ...db.expenses.map((x) => x.category), ...db.products.map((x) => x.category)].filter((c) => c && c.trim()))] },
    { name: "cost", label: "Último costo por unidad", type: "currency" as const, defaultValue: String(p.cost) },
    { name: "kind", label: "Tipo", type: "select" as const, defaultValue: p.kind === "consumible" ? "consumible" : "venta", options: [{ value: "consumible", label: "Insumo de la empresa" }, { value: "venta", label: "Se vende" }] },
  ];
  const groups = ([["item", t.first], ...GROUPS.slice(1), ["detalle", "Detalle de compras"]]) as readonly (readonly [string, string])[];
  const group = groups.find((x) => x[0] === param(sp, "g"))?.[0] ?? "item";
  const cat = param(sp, "ic"), q = param(sp, "q"), productF = param(sp, "product");
  const range = rangeOf(sp);

  // Período elegido, escrito con las fechas: lo mismo que se está mirando en todas las tarjetas.
  const periodLabel = range.label;
  // Categorías de la empresa: las de Configuración (sin las de mercadería) y las que ya tienen insumos.
  const allCats = [...new Set([...db.settings.expenseCategories.filter((c) => (mode === "insumos" ? !MERCH_CATEGORIES.includes(c) : MERCH_CATEGORIES.includes(c))), ...supplies.map((p) => p.category).filter(Boolean)])];
  const cats = allCats;
  const byId = new Map(supplies.map((p) => [p.id, p]));
  const entries = db.purchases.flatMap((b) =>
    b.items.filter((i) => byId.has(i.productId)).map((i) => ({ date: b.date, product: byId.get(i.productId)!, qty: i.qty, amount: i.qty * i.unitCost + b.shipping / b.items.length })),
  ).filter((e) => e.date >= range.from && e.date <= range.to && (!cat || e.product.category === cat) && (!productF || e.product.id === productF) && (!q || `${e.product.name} ${e.product.sku}`.toLowerCase().includes(q.toLowerCase())));

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const pctOf = (v: number) => (total ? ((v / total) * 100).toFixed(0) : "0");
  const group_ = <K,>(key: (e: (typeof entries)[number]) => K) => {
    const m = new Map<K, typeof entries>();
    for (const e of entries) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
    return [...m];
  };
  const sum = (l: typeof entries) => l.reduce((s, e) => s + e.amount, 0);
  // Más recientes arriba: se ordena por la fecha de la última compra de cada fila.
  const lastDate = (l: typeof entries) => l.reduce((m, e) => (e.date > m ? e.date : m), "");
  const byRecent = (a: [unknown, typeof entries], b: [unknown, typeof entries]) => lastDate(b[1]).localeCompare(lastDate(a[1])) || sum(b[1]) - sum(a[1]);
  const topOf = (l: typeof entries) => {
    const m = new Map<string, number>();
    for (const e of l) m.set(e.product.name, (m.get(e.product.name) ?? 0) + e.amount);
    return [...m].sort((a, b) => b[1] - a[1])[0];
  };
  const bar = (v: number) => <div className="mx-auto mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-success" style={{ width: `${total ? Math.max(3, (v / total) * 100) : 0}%` }} /></div>;
  const money_ = (v: number) => <span className="font-medium tabular-nums">{money(v)}</span>;

  let head: string[] = [], rows: Row[] = [];
  if (group === "detalle" && mode === "insumos") {
    // Cada compra por separado, de la más reciente a la más vieja.
    head = ["Fecha", t.item, "Categoría", "Unidades", "Costo por unidad", t.totalCol, "% del total"];
    rows = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount).map((e, i) => ({
      key: `d${i}`, cells: [fdate(e.date), <div key="n"><p className="font-medium">{e.product.name}</p><p className="text-xs text-muted">{e.product.sku}</p></div>, <CategoryBadge key="c" name={e.product.category} />, int(e.qty), money(e.qty ? e.amount / e.qty : e.amount), money_(e.amount), <div key="p"><span className="text-sm">{pctOf(e.amount)} %</span>{bar(e.amount)}</div>],
    }));
  } else if (group === "item" || group === "detalle") {
    head = [t.item, "Categoría", "Compras", "Última compra", "Unidades", "Último costo por unidad", t.totalCol, "% del total", ""];
    rows = group_((e) => e.product.id).sort(byRecent).map(([id, l]) => {
      const p = byId.get(id)!;
      return {
        key: id, cells: [
          <div key="n"><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div>, <CategoryBadge key="c" name={p.category} />,
          int(l.length), fdate(lastDate(l)), int(l.reduce((s, e) => s + e.qty, 0)), money(p.cost), money_(sum(l)), <div key="p"><span className="text-sm">{pctOf(sum(l))} %</span>{bar(sum(l))}</div>,
          <CreateDrawer key="a" compact iconOnly icon={pencil} buttonLabel="Editar" title={`Editar: ${p.name}`} variant="secondary" action={updateProduct.bind(null, p.id)} fields={editFields(p) as never} />,
        ],
      };
    });
  } else if (group === "categoria") {
    const shown = new Set(entries.map((e) => e.product.category || "Sin categoría"));
    head = ["Categoría", t.items, "Compras", "Última compra", t.most, t.totalCol, "% del total"];
    rows = group_((e) => e.product.category || "Sin categoría").sort(byRecent).map(([c, l]) => ({
      key: c, cells: [<CategoryBadge key="c" name={c === "Sin categoría" ? "" : c} />, int(new Set(l.map((e) => e.product.id)).size), int(l.length), fdate(lastDate(l)), topOf(l)?.[0] ?? "—", money_(sum(l)), <div key="p"><span className="text-sm">{pctOf(sum(l))} %</span>{bar(sum(l))}</div>],
    }));
    // Las categorías de la empresa sin gasto en el período también se muestran (en cero), para tenerlas a mano: Logística, Contador, Dominio…
    if (!cat) for (const c of allCats.filter((c) => !shown.has(c))) rows.push({ key: `z-${c}`, cells: [<CategoryBadge key="c" name={c === "Sin categoría" ? "" : c} />, "0", "0", "—", "—", money_(0), <span key="p" className="text-sm text-muted">0 %</span>] });
  } else {
    const bucket = group === "mes" ? (e: (typeof entries)[number]) => e.date.slice(0, 7) : (e: (typeof entries)[number]) => weekStart(e.date);
    head = [group === "mes" ? "Mes" : "Semana", "Compras", t.most, t.totalCol, "% del total"];
    rows = group_(bucket).sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([k, l]) => ({
      key: String(k), cells: [group === "mes" ? `${String(k).slice(5)}/${String(k).slice(0, 4)}` : `Semana del ${fdate(String(k))}`, int(l.length), topOf(l) ? `${topOf(l)![0]} (${money(topOf(l)![1])})` : "—", money_(sum(l)), <div key="p"><span className="text-sm">{pctOf(sum(l))} %</span>{bar(sum(l))}</div>],
    }));
  }
  if (rows.length) {
    const cols = head.length;
    rows.push({ key: "__total", total: true, cells: head.map((h, i) => (i === 0 ? "TOTAL" : h === "Compras" ? int(entries.length) : h === "Unidades" ? int(entries.reduce((s, e) => s + e.qty, 0)) : h === t.totalCol ? money(total) : h === "% del total" ? "100 %" : i === cols ? "" : "")) });
  }

  const topProduct = topOf(entries);
  const topCat = (() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.product.category || "Sin categoría", (m.get(e.product.category || "Sin categoría") ?? 0) + e.amount);
    return [...m].sort((a, b) => b[1] - a[1])[0];
  })();
  const noPurchases = supplies.filter((p) => !entries.some((e) => e.product.id === p.id)).length;
  const href = (extra: Record<string, string>) => hrefWith(sp, extra);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`;

  return (
    <div className="space-y-4">
      <Guide title="¿Para qué sirve esta pantalla?">{t.intro}</Guide>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard aligned large label={t.total} value={money(total)} hint={periodLabel} />
        <KpiCard aligned large label="Compras" value={int(entries.length)} hint={periodLabel} />
        <KpiCard aligned label={t.top} value={topProduct ? splitName(topProduct[0]).title : "—"} detail={topProduct ? splitName(topProduct[0]).detail : undefined} hint={topProduct ? `${money(topProduct[1])} · ${pctOf(topProduct[1])} % del total\n${periodLabel}` : undefined} />
        <KpiCard aligned label={t.topCat} value={topCat ? topCat[0] : "—"} hint={topCat ? `${money(topCat[1])} · ${pctOf(topCat[1])} % del total\n${periodLabel}` : undefined} />
      </section>
      <PeriodTabs sp={sp} />
      <nav className="flex flex-wrap gap-1.5" aria-label="Agrupar">
        {groups.map(([k, label]) => <Link key={k} href={href({ g: k === "item" ? "" : k })} className={chip(k === group)}>{label}</Link>)}
      </nav>
      {group === "detalle" && detail ? detail : (
        <>
      <Filters sp={sp} dates searchPlaceholder={`Buscar ${t.item.toLowerCase()}`} filters={[{ name: "product", label: t.item, options: [...supplies].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: p.name })) }, { name: "ic", label: "Categoría", options: cats }]} />
      <DataTable
        rows={rows} rowKey={(r) => r.key} emptyTitle={t.empty} emptyDescription="Probá con otro período o cargá un gasto desde la solapa Gastos."
        rowClass={(r) => (r.total ? "bg-success/10 text-success font-semibold" : undefined)}
        columns={head.map((h, i) => ({ key: String(i), header: h, align: i === 0 || h === "Categoría" || h === t.most ? ("left" as const) : ("center" as const), render: (r: Row) => r.cells[i] }))}
      />
        </>
      )}
      {mode === "insumos" && noPurchases > 0 && group === "item" && <p className="text-xs text-muted">{noPurchases} insumo{noPurchases === 1 ? "" : "s"} sin compras en este período no se muestran{cat ? "" : ". Elegí “Todo el historial” para verlos todos"}.</p>}
    </div>
  );
}
