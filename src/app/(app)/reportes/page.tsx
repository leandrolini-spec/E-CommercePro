import Link from "next/link";
import { ExportCsv } from "@/components/shared/ExportCsv";
import { InformeContador } from "./InformeContador";
import { PageHeader, param, type SearchParams } from "@/components/shared/list";
import { ResultadosTab } from "./ResultadosTab";
import { DataTable } from "@/components/ui/DataTable";
import { Guide } from "@/components/ui/Guide";
import { Alert, KpiCard } from "@/components/ui/primitives";
import { fdate, int, money, pct, toCsv } from "@/lib/format";
import { sociedadDb, balance, byProduct, costAssumptions, perUnit, PERIODS, periodRange, saleTotals, type Period } from "@/modules/calc";
import { getDb } from "@/modules/data";
import type { Sale } from "@/modules/types";

const REPORTS = [
  { key: "ventas", label: "Ventas" }, { key: "rentabilidad", label: "Rentabilidad" }, { key: "mercadolibre", label: "Mercado Libre" },
  { key: "tiendanube", label: "Tienda Nube" }, { key: "fueraml", label: "Otros canales de venta" },
  { key: "pack", label: "Packs" }, { key: "producto", label: "Otros productos" }, { key: "balance", label: "Balance" },
];

/** Un color por canal, el mismo en todas las pantallas. */
const CHANNEL_COLORS: Record<string, string> = {
  "Mercado Libre": "#f59e0b", "Tienda Nube": "#2563eb", Instagram: "#db2777", WhatsApp: "#16a34a", "Campaña Meta": "#7c3aed", "Fuera de ML": "#64748b",
};
const channelColor = (c: string) => (c === "Todos" ? "#0f172a" : CHANNEL_COLORS[c] ?? "#0891b2");
/** Orden fijo de las tarjetas: 3 arriba y 3 abajo; "Todos" (suma) siempre al final. */
const CHANNEL_ORDER = ["Mercado Libre", "WhatsApp", "Tienda Nube", "Instagram", "Campaña Meta"];

type Row = { cells: string[]; total?: boolean; color?: string };

export default async function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  const sp = (await searchParams) as SearchParams;
  const tab = param(sp, "tab") === "resultados" ? "resultados" : "reportes";
  const tabs = (
    <nav className="flex flex-wrap gap-1.5" aria-label="Sección">
      {([["reportes", "Reportes", "/reportes"], ["resultados", "Resultados", "/reportes?tab=resultados"]] as const).map(([k, label, href]) => (
        <Link key={k} href={href} className={`inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
      ))}
    </nav>
  );
  if (tab === "resultados") {
    return (
      <div className="space-y-4">
        <PageHeader title="Reportes" subtitle="Resultados mensuales: lo que queda de cada venta después de los cargos, la mercadería y los gastos" />
        {tabs}
        <ResultadosTab db={await getDb()} mParam={param(sp, "m")} />
      </div>
    );
  }
  const db = sociedadDb(await getDb());
  const report = REPORTS.find((r) => r.key === param(sp, "r"))?.key ?? "ventas";
  const period = (PERIODS.find((p) => p.value === param(sp, "p"))?.value ?? "hoy") as Period;
  const { from, to } = periodRange(period);
  const inRange = (s: Sale) => s.status !== "cancelada" && s.date >= from && s.date <= to;
  const productName = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const itemRevenue = (i: Sale["items"][number]) => i.qty * i.unitPrice * (1 - i.discountPct / 100);

  /** Productos vendidos en un conjunto de ventas, opcionalmente separados por canal. */
  function productRows(sales: Sale[], withChannel: boolean): Row[] {
    const map = new Map<string, { name: string; channel: string; orders: Set<string>; units: number; revenue: number }>();
    for (const s of sales)
      for (const i of s.items) {
        const key = `${i.productId}|${withChannel ? s.channel : ""}`;
        const c = map.get(key) ?? { name: productName(i.productId), channel: s.channel, orders: new Set<string>(), units: 0, revenue: 0 };
        c.orders.add(s.id); c.units += i.qty; c.revenue += itemRevenue(i);
        map.set(key, c);
      }
    const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue);
    const out: Row[] = rows.map((c) => ({ cells: [c.name, ...(withChannel ? [c.channel] : []), int(c.orders.size), int(c.units), money(c.revenue)], color: channelColor(c.channel) }));
    if (rows.length) out.push({ total: true, cells: ["Total", ...(withChannel ? [""] : []), int(new Set(sales.map((s) => s.id)).size), int(rows.reduce((a, c) => a + c.units, 0)), money(rows.reduce((a, c) => a + c.revenue, 0))] });
    return out;
  }

  let head: string[] = [], body: Row[] = [];
  let extra: string | null = null;
  let channelCards: { name: string; orders: number; revenue: number }[] = [];
  let kpis: { label: string; value: string; hint?: string }[] = [];

  // Todos los canales configurados aparecen siempre, aunque todavía no tengan ventas (en 0).
  const channelSummary = (sales: Sale[], channels: string[] = db.settings.channels) => {
    const m = new Map<string, { orders: number; revenue: number }>(channels.map((c) => [c, { orders: 0, revenue: 0 }]));
    for (const s of sales) {
      const c = m.get(s.channel) ?? { orders: 0, revenue: 0 };
      c.orders++; c.revenue += saleTotals(db, s).revenue;
      m.set(s.channel, c);
    }
    return [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  };

  if (report === "ventas") {
    head = ["Producto", "Canal", "Ventas", "Unidades", "Facturación"];
    body = productRows(db.sales.filter(inRange), true);
    channelCards = channelSummary(db.sales.filter(inRange));
  } else if (report === "rentabilidad") {
    head = ["Producto", "Facturación", "Costo", "Margen", "Margen %"];
    body = byProduct(db, from, to).sort((a, b) => b.marginPct - a.marginPct).map((p) => ({ cells: [p.name, money(p.revenue), money(p.cost), money(p.margin), pct(p.marginPct)] }));
  } else if (report === "mercadolibre") {
    const ml = db.sales.filter((x) => x.channel === "Mercado Libre" && inRange(x));
    const g = new Map<string, { orders: number; units: number; bruto: number; neto: number }>();
    for (const x of ml) {
      const t = saleTotals(db, x);
      const name = productName(x.items[0].productId);
      const c = g.get(name) ?? { orders: 0, units: 0, bruto: 0, neto: 0 };
      c.orders++; c.units += t.units; c.bruto += t.revenue; c.neto += t.net;
      g.set(name, c);
    }
    head = ["Publicación", "Órdenes", "Unidades", "Bruto", "Cargos", "Neto"];
    body = [...g].sort((a, b) => b[1].bruto - a[1].bruto).map(([n, c]) => ({ cells: [n, String(c.orders), String(c.units), money(c.bruto), money(c.bruto - c.neto), money(c.neto)], color: channelColor("Mercado Libre") }));
    extra = "Ventas de Mercado Libre que entran solas desde la conexión. Cargos = lo que descuenta Mercado Libre de cada venta.";
  } else if (report === "tiendanube" || report === "fueraml") {
    const sales = db.sales.filter((s) => inRange(s) && (report === "tiendanube" ? s.channel === "Tienda Nube" : s.channel !== "Mercado Libre" && s.channel !== "Tienda Nube"));
    head = report === "fueraml" ? ["Producto", "Canal", "Ventas", "Unidades", "Facturación"] : ["Producto", "Ventas", "Unidades", "Facturación"];
    body = productRows(sales, report === "fueraml");
    const rev = sales.reduce((a, s) => a + saleTotals(db, s).revenue, 0);
    kpis = [
      { label: "Ventas", value: int(sales.length) }, { label: "Unidades", value: int(sales.reduce((a, s) => a + saleTotals(db, s).units, 0)) },
      { label: "Facturación", value: money(rev) }, { label: "Ticket promedio", value: money(sales.length ? rev / sales.length : 0) },
    ];
    if (report === "fueraml") channelCards = channelSummary(sales, db.settings.channels.filter((c) => c !== "Mercado Libre" && c !== "Tienda Nube"));
    extra = report === "tiendanube"
      ? "Ventas de Tienda Nube cargadas desde Stock → Cargar ventas, hasta que la tienda se conecte sola."
      : "Ventas por WhatsApp, Instagram, Meta y cualquier otro canal que no sea Mercado Libre ni Tienda Nube (esos tienen su propia solapa). Se cargan desde Stock → Cargar ventas.";
  } else if (report === "balance") {
    // El Balance se muestra con bloques (más abajo); acá se prepara solo la exportación a Excel.
    const b = balance(db);
    head = ["Concepto", "Importe"];
    body = [
      { cells: [`Ventas brutas (${b.count})`, money(b.bruto)] }, { cells: ["Cargos e impuestos de los canales", `− ${money(b.fees)}`] }, { cells: ["Ventas netas", money(b.neto)] },
      { cells: ["Gastos de la operación", `− ${money(b.operativos)}`] }, { cells: ["Resultado de lo vendido", money(b.resultadoVendido)] },
      { cells: ["Stock para kits, todavía sin vender", `− ${money(b.stockKits)}`] }, { cells: ["Caja después de comprar stock", money(b.caja)] },
      ...b.advancesByPerson.map((x) => ({ cells: [`Retiro de ${x.name}`, `− ${money(x.amount)}`] })),
      { cells: ["Queda después de los retiros", money(b.cajaTrasAdelantos)] },
      ...b.byPerson.map((x) => ({ cells: [x.name === "Sin asignar" ? "Gastos sin asignar" : `Gastos que puso ${x.name}`, money(x.amount)] })),
    ];
    if (b.claims) extra = `${b.claims} venta${b.claims === 1 ? " tiene" : "s tienen"} reclamo abierto (${money(b.claimsNet)} netos). Si se reembolsa, la caja baja a ${money(b.caja - b.claimsNet)}.`;
  } else if (report === "pack") {
    const u = perUnit(db);
    const a = u.assumptions;
    head = ["Pack", "Packs", "Productos", "Bruto / unidad", "Neto / unidad", "Costo / unidad", "Queda / unidad", "Queda total"];
    body = u.rows.map((r) => ({ cells: [r.product.name, String(r.packs), String(r.units), money(r.perUnit.bruto), money(r.perUnit.neto), money(r.perUnit.costo), money(r.perUnit.queda), money(r.queda)] }));
    if (u.units) body.push({ total: true, cells: ["Total", "", String(u.units), "", "", "", money(u.quedaPerUnit), money(u.queda)] });
    extra = `Estimado, no cambia el Balance. Productos al costo del pack cargado en el producto · caja ${money(a.box)} por pack · logística ${money(a.logistics)} por envío · GNC ≈ ${a.gncPct.toFixed(2).replace(".", ",")} % de la venta. Se ajusta en Configuración.`;
  } else if (report === "producto") {
    // Igual que "Packs", pero para los productos que no son packs de productos (kits, macetas, herramientas, semillas…).
    const sales = db.sales.filter(inRange);
    const bruto = sales.reduce((a, s) => a + saleTotals(db, s).revenue, 0);
    const as = costAssumptions(db, bruto);
    const rows = db.products.filter((p) => !p.packSize).map((p) => {
      const mine = sales.filter((s) => s.items.some((i) => i.productId === p.id));
      let units = 0, br = 0, ne = 0;
      for (const s of mine) {
        const t = saleTotals(db, s);
        for (const i of s.items.filter((x) => x.productId === p.id)) {
          const share = t.revenue ? itemRevenue(i) / t.revenue : 0;
          units += i.qty; br += t.revenue * share; ne += t.net * share;
        }
      }
      const costo = p.cost * units + as.box * units + as.logistics * mine.length + (as.gncPct / 100) * br;
      return { p, units, br, ne, costo, queda: ne - costo };
    }).filter((r) => r.units > 0).sort((a, b) => b.queda - a.queda);
    head = ["Producto", "Unidades", "Bruto / unidad", "Neto / unidad", "Costo / unidad", "Queda / unidad", "Queda total"];
    body = rows.map((r) => ({ cells: [r.p.name, int(r.units), money(r.br / r.units), money(r.ne / r.units), money(r.costo / r.units), money(r.queda / r.units), money(r.queda)] }));
    if (rows.length) body.push({ total: true, cells: ["Total", int(rows.reduce((a, r) => a + r.units, 0)), "", "", "", "", money(rows.reduce((a, r) => a + r.queda, 0))] });
    extra = `Estimado, no cambia el Balance. Costo del producto (en un kit, la suma de lo que lleva) · caja ${money(as.box)} por unidad · logística ${money(as.logistics)} por envío · GNC ≈ ${as.gncPct.toFixed(2).replace(".", ",")} % de la venta. Los productos están en la solapa "Packs".`;
  }

  const csv = toCsv([head, ...body.map((r) => r.cells)]);
  const b = report === "balance" ? balance(db) : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Reportes" subtitle={`${fdate(from)} al ${fdate(to)}`} actions={<ExportCsv filename={`reporte-${report}.csv`} csv={csv} />} />
      {tabs}
      <InformeContador db={db} mes={param(sp, "mes")} report={report} period={period} />
      <nav className="flex flex-wrap gap-1.5" aria-label="Reporte">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`?r=${r.key}&p=${period}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${r.key === report ? "bg-primary text-white" : "bg-surface text-muted hover:text-ink border border-line"}`}>{r.label}</Link>
        ))}
      </nav>
      <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Período">
        {PERIODS.map((p) => (
          <Link key={p.value} href={`?r=${report}&p=${p.value}`} className={`rounded-full border px-2.5 py-0.5 ${p.value === period ? "border-primary text-primary" : "border-line text-muted hover:text-ink"}`}>{p.label}</Link>
        ))}
      </nav>
      {extra && (report === "balance" ? <Alert tone="info" title="Reclamos">{extra}</Alert> : <Guide title="¿Querés saber cómo se calcula?">{extra}</Guide>)}

      {kpis.length > 0 && <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map((k) => <KpiCard key={k.label} {...k} />)}</section>}

      {channelCards.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Por canal de venta</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...[...channelCards].sort((a, b) => (CHANNEL_ORDER.indexOf(a.name) + 1 || 99) - (CHANNEL_ORDER.indexOf(b.name) + 1 || 99)),
              // La tarjeta "Todos" (suma) va en Ventas; en "Otros canales de venta" se muestran solo los canales.
              ...(report === "fueraml" ? [] : [{ name: "Todos", orders: channelCards.reduce((a, x) => a + x.orders, 0), revenue: channelCards.reduce((a, x) => a + x.revenue, 0) }])].map((c) => {
              const total = channelCards.reduce((a, x) => a + x.revenue, 0) || 1;
              return (
                <div key={c.name} className={`rounded-lg border border-line p-4 ${c.name === "Todos" ? "bg-bg" : "bg-surface"}`} style={{ borderLeft: `4px solid ${channelColor(c.name)}` }}>
                  <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: channelColor(c.name) }} aria-hidden />{c.name}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{money(c.revenue)}</p>
                  <p className="text-xs text-muted">{int(c.orders)} venta{c.orders === 1 ? "" : "s"} · {((c.revenue / total) * 100).toFixed(0)} % del total</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.revenue / total) * 100)}%`, background: channelColor(c.name) }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {b ? <BalanceView b={b} /> : (
        <DataTable
          rows={body} rowKey={(r) => r.cells.join("|")} emptyTitle="Sin datos en el período" rowClass={(r) => (r.total ? "bg-success/10 text-success font-semibold" : undefined)}
          rowStyle={(r) => (r.color && !r.total ? { background: `${r.color}1f`, boxShadow: `inset 4px 0 0 ${r.color}` } : undefined)}
          columns={head.map((h, i) => ({ key: String(i), header: h, align: i === 0 || h === "Canal" ? ("left" as const) : ("right" as const), render: (r: Row) => (h === "Canal" && r.cells[i] ? <span className="inline-flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: channelColor(r.cells[i]) }} aria-hidden />{r.cells[i]}</span> : r.cells[i]) }))}
        />
      )}
      <Guide title="¿Cómo exporto este reporte?">Por ahora se exporta en CSV con el botón de arriba; se abre directo en Excel.</Guide>
    </div>
  );
}

type Line = { label: string; amount: number; kind: "pos" | "neg" | "total" | "info" };

/** Balance en bloques: lo que entra en verde, lo que sale en rojo y cada resultado destacado. */
function BalanceView({ b }: { b: ReturnType<typeof balance> }) {
  const groups: { title: string; tint: string; lines: Line[] }[] = [
    {
      title: "1 · Lo que se vendió", tint: "bg-success/10 text-success",
      lines: [
        { label: `Ventas brutas (${b.count} ventas)`, amount: b.bruto, kind: "pos" },
        { label: "Cargos e impuestos de los canales", amount: -b.fees, kind: "neg" },
        { label: "Ventas netas", amount: b.neto, kind: "total" },
      ],
    },
    {
      title: "2 · Gastos", tint: "bg-danger/10 text-danger",
      lines: [
        { label: "Gastos de la operación", amount: -b.operativos, kind: "neg" },
        { label: "Resultado de lo vendido", amount: b.resultadoVendido, kind: "total" },
        { label: "Stock para kits, todavía sin vender", amount: -b.stockKits, kind: "neg" },
        { label: "Caja después de comprar stock", amount: b.caja, kind: "total" },
      ],
    },
    {
      title: "3 · Retiros de los socios", tint: "bg-warning/10 text-warning",
      lines: [
        ...b.advancesByPerson.map((x): Line => ({ label: `Retiro de ${x.name}`, amount: -x.amount, kind: "neg" })),
        ...(b.advancesByPerson.length ? [] : [{ label: "Todavía no hay retiros", amount: 0, kind: "info" } as Line]),
        { label: "Queda después de los retiros", amount: b.cajaTrasAdelantos, kind: "total" },
      ],
    },
    {
      title: "Quién puso la plata (informativo)", tint: "bg-bg text-muted",
      lines: b.byPerson.map((x): Line => ({ label: x.name === "Sin asignar" ? "Gastos sin asignar" : `Gastos que puso ${x.name}`, amount: x.amount, kind: "info" })),
    },
  ];
  const tone = (n: number) => (n < 0 ? "text-danger" : "text-success");
  const sign = (n: number) => (n < 0 ? `− ${money(-n)}` : `+ ${money(n)}`);
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-5 ${b.cajaTrasAdelantos < 0 ? "border-danger/40 bg-danger/5" : "border-success/40 bg-success/5"}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Queda después de todo</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone(b.cajaTrasAdelantos)}`}>{money(b.cajaTrasAdelantos)}</p>
        <p className="text-xs text-muted">Ventas netas menos gastos, stock para kits y retiros</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="overflow-hidden rounded-lg border border-line bg-surface">
            <h2 className={`px-4 py-2 text-sm font-semibold ${g.tint}`}>{g.title}</h2>
            <ul className="divide-y divide-line">
              {g.lines.map((l) => (
                <li key={l.label} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${l.kind === "total" ? "bg-bg font-semibold" : ""}`}>
                  <span className={l.kind === "info" ? "text-muted" : ""}>{l.label}</span>
                  <span className={`tabular-nums ${l.kind === "info" ? "" : l.kind === "total" ? tone(l.amount) : l.kind === "pos" ? "text-success" : "text-danger"}`}>
                    {l.kind === "info" ? (l.amount ? money(l.amount) : "—") : l.kind === "total" ? money(l.amount) : sign(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
