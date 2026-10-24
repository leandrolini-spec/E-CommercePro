import { isoDate, today } from "@/lib/format";
import { TRAY_COMPOSITION, isProductosOrder, splitOrderItems, trayOf } from "./grower";
import type { Db, Sale } from "./types";

/** Abastecimiento de packs: cuánto se vende por semana, cuánto hay comprometido y cuánto conviene pedir al productor. */
export type TrayKey = (typeof TRAY_COMPOSITION)[number]["key"];
export const TRAYS = TRAY_COMPOSITION;
const zero = (): Record<TrayKey, number> => ({ "200": 0, "70": 0, "70e": 0, "50": 0 });

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export const DEFAULT_PLAN = { capacity: 40, buffer: 15 };
export const planOf = (db: Db) => ({ ...DEFAULT_PLAN, ...(db.settings.company?.trayPlan ?? {}) });

/** Packs de cada tipo que lleva una venta (por el nombre del producto). */
function traysOfSale(db: Db, s: Sale): Record<TrayKey, number> {
  const out = zero();
  for (const i of s.items) {
    const name = db.products.find((p) => p.id === i.productId)?.name ?? "";
    const t = trayOf(`${i.qty} × ${name}`);
    if (t) out[t.tray.key] += t.qty;
  }
  return out;
}

const live = (db: Db) => db.sales.filter((s) => s.status !== "cancelada");

/** Packs vendidas entre dos fechas (inclusive). */
export function traysSold(db: Db, from: string, to: string) {
  const out = zero();
  for (const s of live(db)) {
    const d = s.date.slice(0, 10);
    if (d < from || d > to) continue;
    const t = traysOfSale(db, s);
    for (const k of Object.keys(out) as TrayKey[]) out[k] += t[k];
  }
  return out;
}

/** Últimas semanas completas (lunes a domingo): ventas de cada una por tipo de pack y promedio. */
export function weeklySales(db: Db, n = 4) {
  const currentMonday = mondayOf(today());
  const weeks = Array.from({ length: n }, (_, i) => addDays(currentMonday, -7 * (n - i)));
  const perTray = Object.fromEntries(TRAYS.map((t) => [t.key, [] as number[]])) as Record<TrayKey, number[]>;
  for (const w of weeks) {
    const sold = traysSold(db, w, addDays(w, 6));
    for (const t of TRAYS) perTray[t.key].push(sold[t.key]);
  }
  const avg = Object.fromEntries(TRAYS.map((t) => [t.key, perTray[t.key].reduce((a, b) => a + b, 0) / n])) as Record<TrayKey, number>;
  return { weeks, perTray, avg };
}

/** Packs de pedidos que ya se vendieron y todavía no se entregan (etapas Compra y Empaquetado). */
export function committedTrays(db: Db) {
  const out = zero();
  for (const x of db.shipments ?? []) {
    if (!["compra", "preparado", "empaquetado"].includes(x.stage) || !isProductosOrder(x.items)) continue;
    for (const line of splitOrderItems(x.items).products) {
      const t = trayOf(line);
      if (t) out[t.tray.key] += t.qty;
    }
  }
  return out;
}

/** Packs en mano: el último conteo menos lo vendido desde esa fecha (estimado). Sin conteo, no hay dato. */
export function liveStock(db: Db): Record<TrayKey, number | null> {
  const st = planOf(db).stock;
  const out = { "200": null, "70": null, "70e": null, "50": null } as Record<TrayKey, number | null>;
  if (!st) return out;
  const sold = traysSold(db, st.date, today());
  for (const t of TRAYS) out[t.key] = Math.max(0, (st.counts[t.key] ?? 0) - sold[t.key]);
  return out;
}

export type TrayRow = { key: TrayKey; name: string; weekly: number[]; avg: number; committed: number; stock: number | null; daysLeft: number | null; suggest: number; state: "reponer" | "justo" | "ok" | "sin-dato" };

/** Tabla de abastecimiento: sugerido = ventas promedio por semana + margen de seguridad, menos lo que ya hay en mano; si se pasa de la capacidad se reparte proporcional. */
export function trayTable(db: Db): { rows: TrayRow[]; capacity: number; buffer: number; total: number; capped: boolean; hasStock: boolean; stockDate: string | null } {
  const plan = planOf(db);
  const w = weeklySales(db, 4);
  const stock = liveStock(db);
  const com = committedTrays(db);
  const raw = TRAYS.map((t) => {
    const target = Math.ceil(w.avg[t.key] * (1 + plan.buffer / 100));
    return Math.max(0, target - (stock[t.key] ?? 0));
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  const capped = sum > plan.capacity;
  const factor = capped ? plan.capacity / sum : 1;
  const sug = raw.map((r) => Math.floor(r * factor));
  const rows: TrayRow[] = TRAYS.map((t, i) => {
    const s = stock[t.key];
    const perDay = w.avg[t.key] / 7;
    const daysLeft = s === null ? null : perDay > 0 ? s / perDay : 99;
    const state: TrayRow["state"] = s === null ? "sin-dato" : daysLeft! < 3 ? "reponer" : daysLeft! < 5 ? "justo" : "ok";
    return { key: t.key, name: t.name, weekly: w.perTray[t.key], avg: w.avg[t.key], committed: com[t.key], stock: s, daysLeft, suggest: sug[i], state };
  });
  return { rows, capacity: plan.capacity, buffer: plan.buffer, total: sug.reduce((a, b) => a + b, 0), capped, hasStock: !!plan.stock, stockDate: plan.stock?.date ?? null };
}

export const nowIso = () => isoDate(Date.now());
