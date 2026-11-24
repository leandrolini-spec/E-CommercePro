/**
 * Rentabilidad por producto con los gastos reales del período: lo que queda de cada producto después del costo, la comisión del canal,
 * los gastos operativos (logística, combustible, cajas, librería…) y la publicidad. Reglas puras (sin red ni base).
 */
import { saleTotals } from "./calc";
import type { Db, Expense, Sale } from "./types";

/** Gastos que se reparten entre las ventas: lo que cuesta entregar cada pedido. */
/** Comisión del canal que se estima cuando el canal todavía no informó el cargo real de una venta. */
export const COMISION_PCT = 14;

const OPERATIVO = /(log[ií]stica|combustible|nafta|gnc|peaje|caja|packaging|librer[ií]a|flete|env[ií]o|otros)/i;
const PUBLICIDAD = /publicidad/i;

export type ProductProfit = {
  productId: string; name: string; sales: number; units: number;
  revenue: number; cost: number; fee: number; ops: number; ads: number; profit: number; profitPct: number; perSale: number;
  /** Gastos operativos repartidos a este producto, por categoría. */
  opsDetail: Record<string, number>;
  /** Ventas de este producto cuya comisión se estimó (el canal todavía no informó el cargo real). */
  feeEstimated: number;
};

/** Cada categoría de gasto del período y qué se hizo con ella. */
export type ExpenseLine = { category: string; count: number; amount: number; treatment: "reparte" | "publicidad" | "fijo" };

export type Profitability = {
  rows: ProductProfit[];
  total: Omit<ProductProfit, "productId" | "name">;
  /** Gastos del período que no se reparten por producto (contador, sistemas, servicios…). */
  fixed: number;
  /** Ventas de Mercado Libre sin el cargo real cargado: la comisión se estimó con el % general. */
  estimatedFees: number;
  /** Cuántas ventas hay en el período (sin canceladas). */
  salesCount: number;
  /** Gastos del período agrupados por categoría, con el tratamiento que recibió cada uno. */
  expenseLines: ExpenseLine[];
};

/** Un gasto del período es de publicidad si lo dice la categoría o la descripción (por ejemplo "Mercado Libre cargos y publicidad"). */
export const isAdExpense = (e: Pick<Expense, "category" | "description">) => PUBLICIDAD.test(e.category) || PUBLICIDAD.test(e.description);

const normCat = (c: string) => c.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const labelCat = (c: string) => { const t = c.trim() || "Sin categoría"; return t.charAt(0).toUpperCase() + t.slice(1); };

export function profitabilityByProduct(db: Db, from: string, to: string): Profitability {
  const pct = COMISION_PCT / 100;
  const sales = db.sales.filter((s: Sale) => s.status !== "cancelada" && s.date >= from && s.date <= to);
  const expenses = db.expenses.filter((e) => e.date.slice(0, 10) >= from && e.date.slice(0, 10) <= to && e.kind !== "venta" && !e.kitStock);
  const ads = expenses.filter(isAdExpense).reduce((s, e) => s + e.amount, 0);
  const operativo = expenses.filter((e) => !isAdExpense(e) && OPERATIVO.test(e.category)).reduce((s, e) => s + e.amount, 0);
  const fixed = expenses.filter((e) => !isAdExpense(e) && !OPERATIVO.test(e.category)).reduce((s, e) => s + e.amount, 0);
  // Agrupa los gastos por categoría (sin distinguir tildes ni mayúsculas) y anota qué se hizo con cada una.
  const lines = new Map<string, ExpenseLine>();
  for (const e of expenses) {
    const treatment: ExpenseLine["treatment"] = isAdExpense(e) ? "publicidad" : OPERATIVO.test(e.category) ? "reparte" : "fijo";
    const key = `${treatment}|${treatment === "publicidad" ? "publicidad" : normCat(e.category)}`;
    const l = lines.get(key) ?? { category: treatment === "publicidad" ? "Publicidad" : labelCat(e.category), count: 0, amount: 0, treatment };
    l.count++; l.amount += e.amount; lines.set(key, l);
  }
  // Gastos operativos por categoría (para repartirlos por producto).
  const opsCats = new Map<string, { label: string; amount: number }>();
  for (const l of lines.values()) if (l.treatment === "reparte") opsCats.set(normCat(l.category), { label: l.category, amount: l.amount });

  const totalRevenue = sales.reduce((s, x) => s + saleTotals(db, x).revenue, 0);
  const opsPerSale = sales.length ? operativo / sales.length : 0;
  const map = new Map<string, ProductProfit & { saleIds: Set<string> }>();
  let estimatedFees = 0;

  for (const s of sales) {
    const t = saleTotals(db, s);
    // El cargo del canal es lo que realmente se cobró; si Mercado Libre todavía no lo informó (neto = bruto), se estima.
    let fee = t.fees;
    let feeWasEstimated = false;
    if (s.channel === "Mercado Libre" && fee < t.revenue * 0.005) { fee = t.revenue * pct; estimatedFees++; feeWasEstimated = true; }
    for (const i of s.items) {
      const p = db.products.find((x) => x.id === i.productId);
      const rev = i.qty * i.unitPrice * (1 - i.discountPct / 100);
      const share = t.revenue > 0 ? rev / t.revenue : 0;
      const row = map.get(i.productId) ?? { productId: i.productId, name: p?.name ?? "—", sales: 0, units: 0, revenue: 0, cost: 0, fee: 0, ops: 0, ads: 0, profit: 0, profitPct: 0, perSale: 0, opsDetail: {}, feeEstimated: 0, saleIds: new Set<string>() };
      if (!row.saleIds.has(s.id) && feeWasEstimated) row.feeEstimated++;
      row.saleIds.add(s.id);
      row.units += i.qty; row.revenue += rev; row.cost += i.qty * (p?.cost ?? 0);
      row.fee += fee * share; row.ops += opsPerSale * share;
      for (const c of opsCats.values()) row.opsDetail[c.label] = (row.opsDetail[c.label] ?? 0) + (sales.length ? (c.amount / sales.length) * share : 0);
      row.ads += totalRevenue > 0 ? (ads * rev) / totalRevenue : 0;
      map.set(i.productId, row);
    }
  }

  const finish = <T extends Omit<ProductProfit, "productId" | "name">>(r: T): T => {
    const profit = r.revenue - r.cost - r.fee - r.ops - r.ads;
    return { ...r, profit, profitPct: r.revenue > 0 ? (profit / r.revenue) * 100 : 0, perSale: r.sales > 0 ? profit / r.sales : 0 };
  };
  const rows = [...map.values()].map(({ saleIds, ...r }) => finish({ ...r, sales: saleIds.size })).sort((a, b) => b.profit - a.profit);
  const sum = (k: "units" | "revenue" | "cost" | "fee" | "ops" | "ads") => rows.reduce((a, r) => a + r[k], 0);
  const opsDetail: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.opsDetail)) opsDetail[k] = (opsDetail[k] ?? 0) + v;
  const total = finish({ sales: sales.length, units: sum("units"), revenue: sum("revenue"), cost: sum("cost"), fee: sum("fee"), ops: sum("ops"), ads: sum("ads"), profit: 0, profitPct: 0, perSale: 0, opsDetail, feeEstimated: estimatedFees });
  const order = { reparte: 0, publicidad: 1, fijo: 2 } as const;
  const expenseLines = [...lines.values()].sort((a, b) => order[a.treatment] - order[b.treatment] || b.amount - a.amount);
  return { rows, total, fixed, estimatedFees, salesCount: sales.length, expenseLines };
}
