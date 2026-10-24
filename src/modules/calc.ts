// Valores calculados. Nunca se guardan: se derivan siempre de los datos (brief, sección 42).
import { isoDaysAgo, today } from "@/lib/format";
import { NEGOCIO } from "./partners";
import type { Db, Product, Purchase, Quote, Sale } from "./types";

/** Fecha desde la que cuentan las cuentas de los socios (lo anterior no entra). Cambiala a la fecha de inicio de tu sociedad. */
export const SOCIEDAD_DESDE = "2000-01-01";

/** Copia de los datos con solo lo de la sociedad (ventas, gastos, caja, compras y movimientos de socios desde SOCIEDAD_DESDE). El stock no se toca. */
export function sociedadDb(db: Db): Db {
  const desde = <T extends { date: string }>(l: T[]) => l.filter((x) => x.date.slice(0, 10) >= SOCIEDAD_DESDE);
  return { ...db, sales: desde(db.sales), expenses: desde(db.expenses), cash: desde(db.cash), purchases: desde(db.purchases), advances: desde(db.advances ?? []) };
}

/** Stock de un producto. En un kit es cuántos se pueden armar con lo que hay de cada componente. */
export function stockOf(db: Db, productId: string, depth = 0): number {
  const p = db.products.find((x) => x.id === productId);
  if (p?.components?.length && depth < 4)
    return Math.max(0, Math.min(...p.components.map((c) => Math.floor(stockOf(db, c.productId, depth + 1) / Math.max(1, c.qty)))));
  return db.movements.filter((m) => m.productId === productId).reduce((s, m) => s + m.qty, 0);
}

/** Qué componente limita cuántos kits se pueden armar (null si no es kit o no falta nada). */
export function kitLimit(db: Db, p: Product): { name: string; have: number; need: number } | null {
  if (!p.components?.length) return null;
  const rows = p.components.map((c) => ({ name: db.products.find((x) => x.id === c.productId)?.name ?? "—", have: stockOf(db, c.productId), need: c.qty }));
  return rows.sort((a, b) => Math.floor(a.have / a.need) - Math.floor(b.have / b.need))[0];
}

/** Movimientos de stock que genera vender `qty` unidades: un kit descuenta cada componente; un producto sin control de stock no descuenta nada. */
export function stockImpact(db: Db, productId: string, qty: number, depth = 0): { productId: string; qty: number }[] {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return [];
  if (p.components?.length && depth < 4) return p.components.flatMap((c) => stockImpact(db, c.productId, qty * c.qty, depth + 1));
  return p.trackStock !== false && !p.unlimited ? [{ productId, qty }] : [];
}

/** Unidades reservadas por ventas todavía no despachadas. */
export const committedOf = (db: Db, productId: string) =>
  db.sales
    .filter((s) => s.status === "pendiente" || s.status === "preparando")
    .flatMap((s) => s.items)
    .filter((i) => i.productId === productId)
    .reduce((t, i) => t + i.qty, 0);

export const marginPct = (p: Pick<Product, "cost" | "price">) => (p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0);

export function saleTotals(db: Db, sale: Sale) {
  const revenue = sale.items.reduce((s, i) => s + i.qty * i.unitPrice * (1 - i.discountPct / 100), 0);
  const cost = sale.items.reduce((s, i) => s + i.qty * (db.products.find((p) => p.id === i.productId)?.cost ?? 0), 0);
  const units = sale.items.reduce((s, i) => s + i.qty, 0);
  const margin = revenue - cost;
  // Cargos e impuestos del canal (p. ej. Mercado Libre): bruto menos lo realmente cobrado.
  const net = sale.netAmount ?? revenue;
  const fees = revenue - net;
  return { revenue, net, fees, cost, units, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0, result: margin - fees - sale.extraCosts };
}

export const purchaseTotal = (p: Purchase) => p.items.reduce((s, i) => s + i.qty * i.unitCost, 0) + p.shipping;

export function quoteTotals(q: Quote) {
  const subtotal = q.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const discount = subtotal * (q.discountPct / 100);
  const tax = (subtotal - discount) * (q.taxPct / 100);
  const shipping = q.shipping ?? 0;
  // Total = productos − descuento + impuestos sobre los productos + logística.
  return { subtotal, discount, tax, shipping, total: subtotal - discount + tax + shipping };
}

/** Un presupuesto enviado con validez vencida figura como vencido. */
export const quoteStatus = (q: Quote) => (q.status === "enviado" && q.validUntil < today() ? "vencido" : q.status);

export type Period = "hoy" | "ayer" | "15" | "mes-anterior" | "mes" | "6m" | "anio";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "hoy", label: "Hoy" }, { value: "ayer", label: "Ayer" }, { value: "15", label: "Últimos 15 días" },
  { value: "mes-anterior", label: "Mes anterior" }, { value: "mes", label: "Este mes" }, { value: "6m", label: "Últimos 6 meses" }, { value: "anio", label: "Este año" },
];

export function periodRange(p: Period): { from: string; to: string } {
  // El año y el mes salen de la fecha de hoy en Argentina (no de la del servidor).
  const [y, mo] = today().split("-").map(Number);
  const m = mo - 1;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case "hoy": return { from: today(), to: today() };
    case "ayer": return { from: isoDaysAgo(1), to: isoDaysAgo(1) };
    case "15": return { from: isoDaysAgo(14), to: today() };
    case "mes-anterior": return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "mes": return { from: iso(new Date(Date.UTC(y, m, 1))), to: today() };
    case "6m": return { from: iso(new Date(Date.UTC(y, m - 5, 1))), to: today() };
    case "anio": return { from: `${y}-01-01`, to: today() };
  }
}

const validSales = (db: Db, from: string, to: string) =>
  db.sales.filter((s) => s.status !== "cancelada" && s.date >= from && s.date <= to);

export function kpis(db: Db, from: string, to: string) {
  const sales = validSales(db, from, to);
  const t = sales.map((s) => saleTotals(db, s));
  const revenue = t.reduce((s, x) => s + x.revenue, 0);
  const cost = t.reduce((s, x) => s + x.cost, 0);
  const extra = sales.reduce((s, x) => s + x.extraCosts, 0);
  const fees = t.reduce((s, x) => s + x.fees, 0);
  const net = t.reduce((s, x) => s + x.net, 0);
  // Las categorías de costo de lo vendido ya están en `cost`: no se descuentan dos veces.
  const expenses = db.expenses
    .filter((e) => e.date >= from && e.date <= to && !db.settings.cogsCategories.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const margin = revenue - cost;
  return {
    revenue, sales: sales.length, orders: sales.length, units: t.reduce((s, x) => s + x.units, 0),
    ticket: sales.length ? revenue / sales.length : 0, cost, margin, marginPct: revenue ? (margin / revenue) * 100 : 0,
    fees, net, estimatedProfit: margin - fees - extra, expenses, result: margin - fees - extra - expenses,
    stockValue: db.products.reduce((s, p) => s + Math.max(0, stockOf(db, p.id)) * p.cost, 0),
  };
}

export function dailySeries(db: Db, from: string, to: string) {
  const days: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86400000)) days.push(d.toISOString().slice(0, 10));
  return days.map((day) => {
    const sales = validSales(db, day, day).map((s) => saleTotals(db, s));
    return { label: day.slice(8) + "/" + day.slice(5, 7), revenue: sales.reduce((s, x) => s + x.revenue, 0), units: sales.reduce((s, x) => s + x.units, 0), margin: sales.reduce((s, x) => s + x.margin, 0) };
  });
}

export function byChannel(db: Db, from: string, to: string) {
  const map = new Map<string, number>();
  for (const s of validSales(db, from, to)) map.set(s.channel, (map.get(s.channel) ?? 0) + saleTotals(db, s).revenue);
  return [...map].map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
}

export function byProduct(db: Db, from: string, to: string) {
  const map = new Map<string, { units: number; revenue: number; cost: number }>();
  for (const s of validSales(db, from, to))
    for (const i of s.items) {
      const p = db.products.find((x) => x.id === i.productId)!;
      const cur = map.get(p.id) ?? { units: 0, revenue: 0, cost: 0 };
      cur.units += i.qty; cur.revenue += i.qty * i.unitPrice * (1 - i.discountPct / 100); cur.cost += i.qty * p.cost;
      map.set(p.id, cur);
    }
  return [...map].map(([productId, v]) => ({ productId, name: db.products.find((p) => p.id === productId)!.name, ...v, margin: v.revenue - v.cost, marginPct: v.revenue ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 }));
}

/** Los N primeros y el resto agrupado en "Otros" (para tortas legibles). */
export function topWithOthers(rows: { label: string; value: number }[], n = 5) {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const rest = sorted.slice(n).reduce((s, r) => s + r.value, 0);
  return rest > 0 ? [...sorted.slice(0, n), { label: "Otros", value: rest }] : sorted.slice(0, n);
}

/** Ventas por provincia y por localidad de quien compró ("Localidad, Provincia"; sin dato se agrupa aparte). */
export function salesByPlace(db: Db, from: string, to: string) {
  const prov = new Map<string, number>(), loc = new Map<string, number>();
  for (const s of validSales(db, from, to)) {
    const raw = (db.customers.find((c) => c.id === s.customerId)?.city ?? "").trim();
    if (!raw || raw === "Sin dato") { prov.set("Sin dato", (prov.get("Sin dato") ?? 0) + 1); continue; }
    const parts = raw.split(",").map((x) => x.trim());
    const province = parts[parts.length - 1];
    prov.set(province, (prov.get(province) ?? 0) + 1);
    if (parts.length > 1) loc.set(parts[0], (loc.get(parts[0]) ?? 0) + 1);
  }
  const toRows = (m: Map<string, number>) => [...m].map(([label, value]) => ({ label, value }));
  return { provinces: toRows(prov), localities: toRows(loc).sort((a, b) => b.value - a.value) };
}

export type Alert = { key: string; tone: "danger" | "warning"; title: string; detail: string; href: string };

export function alerts(db: Db): Alert[] {
  const out: Alert[] = [];
  const noCost: Product[] = [];
  for (const p of db.products.filter((x) => x.active && x.kind !== "consumible")) {
    const tracked = p.trackStock !== false;
    const stock = stockOf(db, p.id);
    const hasPendingPurchase = db.purchases.some((b) => (b.status === "pendiente" || b.status === "parcial") && b.items.some((i) => i.productId === p.id));
    if (tracked && stock <= 0) out.push({ key: `ns-${p.id}`, tone: "danger", title: `Sin stock: ${p.name}`, detail: "No quedan unidades disponibles.", href: "/stock" });
    else if (tracked && stock <= p.minStock / 2) out.push({ key: `sc-${p.id}`, tone: "danger", title: `Stock crítico: ${p.name}`, detail: `Quedan ${stock} (mínimo ${p.minStock}).`, href: "/stock" });
    else if (tracked && stock <= p.minStock) out.push({ key: `sb-${p.id}`, tone: "warning", title: `Stock bajo: ${p.name}`, detail: `Quedan ${stock} (mínimo ${p.minStock}).`, href: "/stock" });
    if (tracked && stock <= p.minStock && !hasPendingPurchase) out.push({ key: `cn-${p.id}`, tone: "warning", title: `Compra necesaria: ${p.name}`, detail: "Está bajo el mínimo y no hay compra pendiente.", href: "/gastos?tab=compras" });
    if (p.cost <= 0) noCost.push(p);
    else if (p.price > 0 && marginPct(p) < 15) out.push({ key: `ml-${p.id}`, tone: "danger", title: `Margen demasiado bajo: ${p.name}`, detail: `Margen del ${marginPct(p).toFixed(1)} %.`, href: "/productos" });
  }
  // Productos sin costo: solo importan los que ya se vendieron; se avisa una sola vez, con el total.
  const sold = new Set(db.sales.filter((s) => s.status !== "cancelada").flatMap((s) => s.items.map((i) => i.productId)));
  const soldNoCost = noCost.filter((p) => sold.has(p.id));
  if (soldNoCost.length) out.push({ key: "sin-costo", tone: "warning", title: `${soldNoCost.length} producto${soldNoCost.length === 1 ? "" : "s"} vendido${soldNoCost.length === 1 ? "" : "s"} sin costo cargado`, detail: "El margen y la ganancia salen más altos que los reales hasta cargarlo.", href: "/productos?cost=0" });
  // Pedidos pendientes hace días: un solo aviso con el total.
  const late = db.sales.filter((x) => x.status === "pendiente" && x.date <= isoDaysAgo(2));
  if (late.length) out.push({ key: "pedidos-pend", tone: "danger", title: `${late.length} pedido${late.length === 1 ? "" : "s"} pendiente${late.length === 1 ? "" : "s"} hace más de 2 días`, detail: "Hay que prepararlos o marcarlos como entregados.", href: "/pedidos" });
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));
}

/** Parte de las ventas del período que corresponde a productos sin costo (el margen de esa parte no es confiable). */
export function costCoverage(db: Db, from: string, to: string) {
  let total = 0, missing = 0;
  for (const s of db.sales.filter((x) => x.status !== "cancelada" && x.date >= from && x.date <= to)) {
    for (const i of s.items) {
      const v = i.qty * i.unitPrice * (1 - i.discountPct / 100);
      total += v;
      if ((db.products.find((p) => p.id === i.productId)?.cost ?? 0) <= 0) missing += v;
    }
  }
  return { total, missing, pct: total ? (missing / total) * 100 : 0 };
}

/* ---------- Balance (caja real) y análisis por unidad ---------- */

export function balance(db: Db) {
  const gastos = db.expenses.reduce((s, e) => s + e.amount, 0);
  const stockKits = db.expenses.filter((e) => e.kitStock).reduce((s, e) => s + e.amount, 0);
  const operativos = gastos - stockKits;
  const counted = db.sales.filter((s) => s.status !== "cancelada");
  const t = counted.map((s) => saleTotals(db, s));
  const bruto = t.reduce((s, x) => s + x.revenue, 0);
  const neto = t.reduce((s, x) => s + x.net, 0);
  const claims = counted.filter((s) => s.payStatus === "reclamo");
  const claimsNet = claims.reduce((s, x) => s + saleTotals(db, x).net, 0);
  const byPerson = new Map<string, number>();
  for (const e of db.expenses) byPerson.set(e.paidBy || "Sin asignar", (byPerson.get(e.paidBy || "Sin asignar") ?? 0) + e.amount);
  const draws = (db.advances ?? []).filter((a) => a.kind !== "inversion");
  const advances = draws.reduce((s, a) => s + a.amount, 0);
  const advancesBy = new Map<string, number>();
  for (const a of draws) advancesBy.set(a.partner, (advancesBy.get(a.partner) ?? 0) + a.amount);
  const investments = (db.advances ?? []).filter((a) => a.kind === "inversion").reduce((s, a) => s + a.amount, 0)
    + db.expenses.filter((e) => e.paidBy && e.paidBy !== NEGOCIO).reduce((s, e) => s + e.amount, 0);
  return {
    count: counted.length, bruto, fees: bruto - neto, neto, gastos, stockKits, operativos,
    resultadoVendido: neto - operativos, caja: neto - gastos, advances, investments, advancesByPerson: [...advancesBy].map(([name, amount]) => ({ name, amount })), cajaTrasAdelantos: neto - gastos - advances, claims: claims.length, claimsNet,
    byPerson: [...byPerson].map(([name, amount]) => ({ name, amount })),
  };
}

/** Costos estimados por pack: automáticos desde los gastos salvo que estén fijados en Configuración. */
export function costAssumptions(db: Db, brutoPacks: number) {
  const c = db.settings.costs;
  const cajas = db.expenses.filter((e) => /caja/i.test(e.description));
  const cajasQty = cajas.reduce((s, e) => s + (e.quantity ?? 1), 0);
  const cajasTot = cajas.reduce((s, e) => s + e.amount, 0);
  const gncTot = db.expenses.filter((e) => /gnc/i.test(e.description)).reduce((s, e) => s + e.amount, 0);
  const boxAuto = cajasQty ? cajasTot / cajasQty : 0;
  const gncAuto = brutoPacks ? (gncTot / brutoPacks) * 100 : 0;
  return {
    logistics: c.logisticsPerShipment, box: c.boxPerPack > 0 ? c.boxPerPack : boxAuto, boxAuto, boxAutoQty: cajasQty,
    gncPct: c.gncPct > 0 ? c.gncPct : gncAuto, gncAuto, gncTot,
  };
}

export function perUnit(db: Db) {
  const groups = db.products
    .filter((p) => p.packSize)
    .map((p) => {
      const sales = db.sales.filter((s) => s.status !== "cancelada" && s.items.some((i) => i.productId === p.id));
      let packs = 0, bruto = 0, neto = 0;
      for (const s of sales) {
        const t = saleTotals(db, s);
        for (const i of s.items.filter((x) => x.productId === p.id)) {
          const share = t.revenue ? (i.qty * i.unitPrice * (1 - i.discountPct / 100)) / t.revenue : 0;
          packs += i.qty; bruto += t.revenue * share; neto += t.net * share;
        }
      }
      return { product: p, packs, ventas: sales.length, bruto, neto };
    })
    .filter((g) => g.ventas > 0)
    .sort((a, b) => b.packs - a.packs);
  const as = costAssumptions(db, groups.reduce((s, g) => s + g.bruto, 0));
  const rows = groups.map((g) => {
    const size = g.product.packSize!;
    const units = g.packs * size;
    const productos = g.product.cost * g.packs, caja = as.box * g.packs, log = as.logistics * g.ventas, gnc = (as.gncPct / 100) * g.bruto;
    const costo = productos + caja + log + gnc, queda = g.neto - costo;
    return { ...g, size, units, productos, caja, log, gnc, costo, queda, perUnit: { bruto: g.bruto / units, neto: g.neto / units, costo: costo / units, queda: queda / units } };
  });
  const units = rows.reduce((s, r) => s + r.units, 0), queda = rows.reduce((s, r) => s + r.queda, 0);
  return { rows, assumptions: as, units, queda, quedaPerUnit: units ? queda / units : 0 };
}

/** Cuenta de cada socio: invirtió = gastos que pagó + inversiones anotadas a mano; retiró = retiros anotados. */
export function partnerAccounts(db: Db) {
  const map = new Map<string, { partner: string; invirtio: number; retiro: number }>();
  const get = (p: string) => map.get(p) ?? (map.set(p, { partner: p, invirtio: 0, retiro: 0 }), map.get(p)!);
  for (const e of db.expenses) if (e.paidBy && e.paidBy !== NEGOCIO) get(e.paidBy).invirtio += e.amount;
  for (const a of db.advances ?? []) {
    if (a.kind === "inversion") get(a.partner).invirtio += a.amount;
    else get(a.partner).retiro += a.amount;
  }
  return [...map.values()];
}
