import { createHmac, timingSafeEqual } from "node:crypto";
import { balance, saleTotals, sociedadDb } from "./calc";
import type { Db, Expense, Sale } from "./types";

/** Primer mes del que se puede sacar informe: desde que existe la sociedad (igual que Reportes). */
export const INFORME_DESDE = "2025-10"; // primer mes con ventas cargadas

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const monthLabel = (mes: string) => `${MONTHS[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;
export const validMes = (mes: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);

/** Meses con informe disponible (del más nuevo al más viejo), hasta `hoy` (AAAA-MM-DD). */
export function mesesDisponibles(hoy: string, max = 14): string[] {
  const out: string[] = [];
  let y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  while (out.length < max) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key < INFORME_DESDE) break;
    out.push(key);
    if (--m === 0) { m = 12; y--; }
  }
  return out.length ? out : [INFORME_DESDE];
}

/* ---- Enlace para compartir (sin iniciar sesión): firmado, solo sirve para ese mes ---- */
const secret = () => process.env.TOKEN_ENC_KEY ?? process.env.CRON_SECRET ?? "";
export const informeToken = (mes: string) => createHmac("sha256", secret()).update(`informe:${mes}`).digest("base64url").slice(0, 32);
export function informeTokenOk(mes: string, token: string | null): boolean {
  if (!secret() || !token) return false;
  const a = Buffer.from(informeToken(mes)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---- Datos del informe ---- */
export type InformeSale = { number: number; date: string; channel: string; customer: string; payMethod: string; gross: number; fees: number; net: number; status: string };
export type InformeExpense = { date: string; category: string; description: string; kind: string; paidBy: string; amount: number };
export type Informe = {
  mes: string; label: string; generated: string;
  company: { name: string; legalName: string; holder: string; cuit: string; taxCondition: string; address: string; phone: string; email: string; logoUrl: string };
  summary: { count: number; units: number; gross: number; fees: number; net: number; expenses: number; kitStock: number; operating: number; result: number; cash: number; cancelled: number; claims: number };
  byChannel: { name: string; count: number; gross: number; fees: number; net: number }[];
  byPay: { name: string; count: number; gross: number; net: number }[];
  sales: InformeSale[];
  expensesByCategory: { name: string; count: number; amount: number }[];
  expenses: InformeExpense[];
};

const KIND: Record<string, string> = { venta: "Mercadería", insumo: "Insumo", inversion: "Inversión" };

export function buildInforme(full: Db, mes: string, generated: string): Informe {
  const db = sociedadDb(full);
  const inMonth = <T extends { date: string }>(l: T[]) => l.filter((x) => x.date.slice(0, 7) === mes);
  const sales: Sale[] = inMonth(db.sales).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  const expenses: Expense[] = inMonth(db.expenses).sort((a, b) => a.date.localeCompare(b.date));
  const mdb: Db = { ...db, sales, expenses, advances: inMonth(db.advances ?? []) };
  const b = balance(mdb);
  const counted = sales.filter((s) => s.status !== "cancelada");
  const customer = (id: string) => full.customers.find((c) => c.id === id)?.name ?? "—";

  const group = <K extends string>(list: Sale[], key: (s: Sale) => K) => {
    const m = new Map<K, Sale[]>();
    for (const s of list) m.set(key(s), [...(m.get(key(s)) ?? []), s]);
    return [...m];
  };
  const tot = (l: Sale[]) => l.reduce((a, s) => { const t = saleTotals(db, s); return { gross: a.gross + t.revenue, fees: a.fees + t.fees, net: a.net + t.net }; }, { gross: 0, fees: 0, net: 0 });

  const cat = new Map<string, Expense[]>();
  for (const e of expenses) cat.set(e.category || "Sin categoría", [...(cat.get(e.category || "Sin categoría") ?? []), e]);

  const c = full.settings.company ?? {};
  return {
    mes, label: monthLabel(mes), generated,
    company: {
      name: full.settings.name, legalName: c.legalName ?? "", holder: c.holderName ?? "", cuit: c.cuit ?? "", taxCondition: c.taxCondition ?? "",
      address: [c.address, c.city, c.province].filter(Boolean).join(", "), phone: c.phone || c.whatsapp || "", email: c.email ?? "", logoUrl: full.settings.brand?.logoUrl ?? "",
    },
    summary: {
      count: b.count, units: counted.reduce((n, s) => n + saleTotals(db, s).units, 0), gross: b.bruto, fees: b.fees, net: b.neto, expenses: b.gastos, kitStock: b.stockKits, operating: b.operativos,
      result: b.resultadoVendido, cash: b.caja, cancelled: sales.length - counted.length, claims: counted.filter((s) => s.payStatus === "reclamo").length,
    },
    byChannel: group(counted, (s) => s.channel || "Sin canal").map(([name, l]) => ({ name, count: l.length, ...tot(l) })).sort((a, b2) => b2.gross - a.gross),
    byPay: group(counted, (s) => s.payMethod || "Sin indicar").map(([name, l]) => ({ name, count: l.length, gross: tot(l).gross, net: tot(l).net })).sort((a, b2) => b2.gross - a.gross),
    sales: sales.map((s) => { const t = saleTotals(db, s); return { number: s.number, date: s.date, channel: s.channel, customer: customer(s.customerId), payMethod: s.payMethod, gross: t.revenue, fees: t.fees, net: t.net, status: s.status === "cancelada" ? "Cancelada" : s.payStatus === "reembolsada" ? "Reembolsada" : s.payStatus === "reclamo" ? "Reclamo" : "Cobrada" }; }),
    expensesByCategory: [...cat].map(([name, l]) => ({ name, count: l.length, amount: l.reduce((n, e) => n + e.amount, 0) })).sort((a, b2) => b2.amount - a.amount),
    expenses: expenses.map((e) => ({ date: e.date, category: e.category || "Sin categoría", description: e.description, kind: KIND[e.kind ?? ""] ?? "", paidBy: e.paidBy ?? "", amount: e.amount })),
  };
}
