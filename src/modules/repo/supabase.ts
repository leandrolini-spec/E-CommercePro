// Repositorio Supabase. Solo se usa desde el servidor, con la clave de servicio.
// Toda lectura y escritura va filtrada por project_id.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inAgenda } from "../customers";
import type { Db } from "../types";

let client: SupabaseClient | null = null;
export function service(): SupabaseClient {
  if (client) return client;
  // trim: al pegar valores en el panel del servidor es común que se cuelen espacios o saltos de línea.
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return (client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export const isSupabase = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.DATA_SOURCE !== "file";

async function all<T = Record<string, unknown>>(table: string, projectId: string): Promise<T[]> {
  const { data, error } = await service().from(table).select("*").eq("project_id", projectId);
  if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Proyecto activo: por ahora el primero creado (el selector llega con la tarea T3). */
// El proyecto activo casi nunca cambia: se guarda en memoria 10 minutos para no consultarlo en cada pantalla (antes eran varios viajes a la base por clic).
let activeCache: { id: string; at: number } | null = null;
export async function activeProjectId(): Promise<string> {
  if (activeCache && Date.now() - activeCache.at < 600_000) return activeCache.id;
  const { data, error } = await service().from("projects").select("id").order("created_at").limit(1);
  if (error) throw new Error(`No se pudo leer projects: ${error.message}`);
  if (!data?.length) throw new Error("No hay ningún proyecto en la base. Corré: npm run db:import");
  activeCache = { id: data[0].id as string, at: Date.now() };
  return activeCache.id;
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => Number(v ?? 0);

/** El costo de un kit es la suma del costo de lo que lleva (se recalcula en cada lectura). */
function withKitCosts<T extends { id: string; cost: number; components?: { productId: string; qty: number }[] }>(products: T[]): T[] {
  const base = new Map(products.map((p) => [p.id, p.cost]));
  return products.map((p) => (p.components?.length ? { ...p, cost: Math.round(p.components.reduce((s, c) => s + c.qty * (base.get(c.productId) ?? 0), 0) * 100) / 100 } : p));
}

export async function loadDb(projectId: string): Promise<Db> {
  const [proj, set, products, movements, suppliers, purchases, customers, sales, quotes, expenses, cash, opps, advances, shipments] = await Promise.all([
    service().from("projects").select("*").eq("id", projectId).single(),
    service().from("project_settings").select("*").eq("project_id", projectId).single(),
    all<R>("products", projectId), all<R>("stock_movements", projectId), all<R>("suppliers", projectId), all<R>("purchases", projectId),
    all<R>("customers", projectId), all<R>("sales", projectId), all<R>("quotes", projectId), all<R>("expenses", projectId),
    all<R>("cash_movements", projectId), all<R>("crm_opportunities", projectId), all<R>("partner_advances", projectId), all<R>("shipments", projectId),
  ]);
  if (proj.error) throw new Error(`No se pudo leer el proyecto: ${proj.error.message}`);
  if (set.error) throw new Error(`No se pudo leer la configuración: ${set.error.message}`);
  const s = set.data as R;
  const cancelledSales = new Set(sales.filter((v) => v.status === "cancelada").map((v) => String(v.id)));
  return {
    isDemo: proj.data.is_demo, nextId: 0,
    settings: {
      name: proj.data.name, currency: s.currency, country: s.country, mlSite: s.ml_site, taxPct: n(s.tax_pct), channels: s.channels,
      categories: s.categories, units: s.units, payMethods: s.pay_methods, expenseCategories: s.expense_categories,
      cogsCategories: s.cogs_categories, costs: s.costs, shipmentStages: (s.shipment_stages ?? []) as { id: string; name: string; color: string }[],
      company: (s.company ?? {}) as R, brand: (s.brand ?? {}) as R,
    },
    products: withKitCosts(products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, unit: p.unit, cost: n(p.cost), price: n(p.price), minStock: n(p.min_stock), maxStock: n(p.max_stock), supplierId: p.supplier_id ?? "", active: p.active, packSize: p.pack_size ?? undefined, trackStock: p.track_stock, unlimited: !!p.unlimited, description: p.description ?? "", kind: (p.kind ?? "venta") as "venta" | "componente" | "consumible", components: ((p.components ?? []) as { productId: string; qty: number }[]), listings: ((p.listings ?? []) as { channel: string; status: "active" | "out_of_stock" | "paused"; price: number; url: string }[]) }))),
    movements: movements.map((m) => ({ id: m.id, productId: m.product_id, type: m.type, qty: n(m.qty), date: m.date, reason: m.reason, ref: m.ref ?? undefined, unitCost: m.unit_cost == null ? undefined : n(m.unit_cost) })),
    suppliers: suppliers.map((x) => ({ id: x.id, name: x.name, company: x.company, phone: x.phone, email: x.email, cuit: x.cuit, leadDays: n(x.lead_days), payTerms: x.pay_terms, contactName: x.contact_name ?? "", category: x.category ?? "", address: x.address ?? "", city: x.city ?? "", website: x.website ?? "", notes: x.notes ?? "" })),
    purchases: purchases.map((b) => ({ id: b.id, supplierId: b.supplier_id ?? "", date: b.date, status: b.status, payMethod: b.pay_method, shipping: n(b.shipping), items: b.items })),
    customers: customers.map((c) => ({ id: c.id, name: c.name, company: c.company, phone: c.phone, email: c.email, city: c.city, origin: c.origin, createdAt: c.created_at, nickname: c.nickname ?? "", address: c.address ?? "", doc: c.doc ?? "", notes: c.notes ?? "", agendaOff: !!c.agenda_off, full: inAgenda({ name: c.name, phone: c.phone, address: c.address, agendaOff: !!c.agenda_off }) })),
    sales: sales.map((v) => ({ id: v.id, number: v.number, customerId: v.customer_id ?? "", date: v.date, channel: v.channel, status: v.status, payMethod: v.pay_method, extraCosts: n(v.extra_costs), items: v.items, netAmount: v.net_amount == null ? undefined : n(v.net_amount), payStatus: v.pay_status ?? undefined, mlOrderId: v.ml_order_id ?? undefined, welcomed: !!v.welcomed, welcomedAt: v.welcomed_at ?? undefined, welcomeSentAt: v.welcome_sent_at ?? undefined, welcomeBy: (v.welcome_by ?? undefined) as "auto" | "manual" | undefined, refundedAt: v.refunded_at ?? undefined, refundDoneAt: v.refund_done_at ?? undefined, waitingHidden: !!v.waiting_hidden })),
    quotes: quotes.map((q) => ({ id: q.id, number: q.number, customerId: q.customer_id ?? "", date: q.date, validUntil: q.valid_until, status: q.status, discountPct: n(q.discount_pct), taxPct: n(q.tax_pct), items: q.items, shipping: n(q.shipping), customerName: q.customer_name ?? "", notes: q.notes ?? "", customerPhone: q.customer_phone ?? "", customerEmail: q.customer_email ?? "", shareToken: q.share_token ?? "" })),
    expenses: expenses.map((e) => ({ id: e.id, date: e.date, category: e.category, description: e.description, amount: n(e.amount), payMethod: e.pay_method, quantity: n(e.quantity), paidBy: e.paid_by, kitStock: e.kit_stock, kind: (e.kind || undefined) as "venta" | "insumo" | "inversion" | undefined })),
    cash: cash.map((k) => ({ id: k.id, date: k.date, type: k.type, account: k.account, concept: k.concept, amount: n(k.amount) })),
    advances: advances.map((a) => ({ id: a.id, date: a.date, partner: a.partner, amount: n(a.amount), note: a.note, kind: (a.kind === "inversion" ? "inversion" : "retiro") as "retiro" | "inversion" })).sort((x, y) => y.date.localeCompare(x.date)),
    // Un envío de una venta cancelada no existe a ningún efecto: no aparece en Envíos, ni en la campanita, ni en la lista del chofer.
    shipments: shipments.filter((x) => !x.sale_id || !cancelledSales.has(x.sale_id)).map((x) => ({ id: x.id, saleId: x.sale_id ?? undefined, orderRef: x.order_ref, channel: x.channel, customer: x.customer, phone: x.phone, address: x.address, city: x.city, zip: x.zip, items: x.items ?? "", notes: x.notes, tracking: x.tracking, courier: x.courier ?? "", courierPhone: x.courier_phone ?? "", vehicle: x.vehicle ?? "", plate: x.plate ?? "", stage: x.stage, dispatchedAt: x.dispatched_at ?? undefined, deliveredAt: x.delivered_at ?? undefined, createdAt: x.created_at, mlStatus: x.ml_status ?? "", mlShipmentId: x.ml_shipment_id ?? undefined, eta: x.eta ?? undefined, carrier: x.carrier ?? "" })),
    opportunities: opps.map((o) => ({ id: o.id, name: o.name, customerName: o.customer_name, origin: o.origin, value: n(o.value), stage: o.stage, probability: n(o.probability), dueDate: o.due_date ?? "", nextAction: o.next_action })),
  };
}

async function upsert(table: string, rows: R[]) {
  if (!rows.length) return;
  const { error } = await service().from(table).upsert(rows);
  if (error) throw new Error(`No se pudo guardar ${table}: ${error.message}`);
}

/** Filas de cada tabla tal como se guardan en la base. */
function tableRows(projectId: string, db: Db): [string, R[]][] {
  const P = { project_id: projectId };
  return [
    ["suppliers", db.suppliers.map((x) => ({ ...P, id: x.id, name: x.name, company: x.company, phone: x.phone, email: x.email, cuit: x.cuit, lead_days: x.leadDays, pay_terms: x.payTerms, contact_name: x.contactName ?? "", category: x.category ?? "", address: x.address ?? "", city: x.city ?? "", website: x.website ?? "", notes: x.notes ?? "" }))],
    ["products", db.products.map((p) => ({ ...P, id: p.id, sku: p.sku, name: p.name, category: p.category, brand: p.brand, unit: p.unit, cost: p.cost, price: p.price, min_stock: p.minStock, max_stock: p.maxStock, supplier_id: p.supplierId || null, active: p.active, pack_size: p.packSize ?? null, track_stock: p.trackStock !== false, unlimited: p.unlimited ?? false, description: p.description ?? "", kind: p.kind ?? "venta", components: p.components ?? [], listings: p.listings ?? [] }))],
    ["customers", db.customers.map((c) => ({ ...P, id: c.id, name: c.name, company: c.company, phone: c.phone, email: c.email, city: c.city, origin: c.origin, created_at: c.createdAt, nickname: c.nickname ?? "", address: c.address ?? "", doc: c.doc ?? "", notes: c.notes ?? "", agenda_off: !!c.agendaOff, is_full: inAgenda(c) }))],
    ["stock_movements", db.movements.map((m) => ({ ...P, id: m.id, product_id: m.productId, type: m.type, qty: m.qty, date: m.date, reason: m.reason, ref: m.ref ?? null, unit_cost: m.unitCost ?? null }))],
    ["purchases", db.purchases.map((b) => ({ ...P, id: b.id, supplier_id: b.supplierId || null, date: b.date, status: b.status, pay_method: b.payMethod, shipping: b.shipping, items: b.items }))],
    ["sales", db.sales.map((v) => ({ ...P, id: v.id, number: v.number, customer_id: v.customerId || null, date: v.date, channel: v.channel, status: v.status, pay_method: v.payMethod, extra_costs: v.extraCosts, items: v.items, net_amount: v.netAmount ?? null, pay_status: v.payStatus ?? null, ml_order_id: v.mlOrderId ?? null, welcomed: !!v.welcomed, welcomed_at: v.welcomedAt ?? null, welcome_sent_at: v.welcomeSentAt ?? null, welcome_by: v.welcomeBy ?? null, refunded_at: v.refundedAt ?? null, refund_done_at: v.refundDoneAt ?? null, waiting_hidden: !!v.waitingHidden }))],
    ["quotes", db.quotes.map((q) => ({ ...P, id: q.id, number: q.number, customer_id: q.customerId || null, date: q.date, valid_until: q.validUntil, status: q.status, discount_pct: q.discountPct, tax_pct: q.taxPct, items: q.items, shipping: q.shipping ?? 0, customer_name: q.customerName ?? "", notes: q.notes ?? "", customer_phone: q.customerPhone ?? "", customer_email: q.customerEmail ?? "", share_token: q.shareToken ?? "" }))],
    ["expenses", db.expenses.map((e) => ({ ...P, id: e.id, date: e.date, category: e.category, description: e.description, amount: e.amount, pay_method: e.payMethod, quantity: e.quantity ?? 1, paid_by: e.paidBy ?? "", kit_stock: e.kitStock ?? false, kind: e.kind ?? "" }))],
    ["cash_movements", db.cash.map((k) => ({ ...P, id: k.id, date: k.date, type: k.type, account: k.account, concept: k.concept, amount: k.amount }))],
    ["partner_advances", (db.advances ?? []).map((a) => ({ ...P, id: a.id, date: a.date, partner: a.partner, amount: a.amount, note: a.note, kind: a.kind ?? "retiro" }))],
    ["shipments", (db.shipments ?? []).map((x) => ({ ...P, id: x.id, sale_id: x.saleId ?? null, order_ref: x.orderRef, channel: x.channel, customer: x.customer, phone: x.phone, address: x.address, city: x.city, zip: x.zip, items: x.items, notes: x.notes, tracking: x.tracking, courier: x.courier ?? "", courier_phone: x.courierPhone ?? "", vehicle: x.vehicle ?? "", plate: x.plate ?? "", stage: x.stage, dispatched_at: x.dispatchedAt ?? null, delivered_at: x.deliveredAt ?? null, created_at: x.createdAt, ml_status: x.mlStatus ?? "", ml_shipment_id: x.mlShipmentId ?? null, eta: x.eta ?? null, carrier: x.carrier ?? "" }))],
    ["crm_opportunities", db.opportunities.map((o) => ({ ...P, id: o.id, name: o.name, customer_name: o.customerName, origin: o.origin, value: o.value, stage: o.stage, probability: o.probability, due_date: o.dueDate || null, next_action: o.nextAction }))],
  ];
}

// Foto de lo último leído/guardado: permite guardar solo las filas que cambiaron (1-2 consultas en vez de decenas).
const snapshots = new Map<string, Map<string, string>>();
const snapKey = (table: string, row: R) => `${table}:${row.id}`;
function takeSnapshot(projectId: string, db: Db) {
  const m = new Map<string, string>();
  for (const [t, rows] of tableRows(projectId, db)) for (const r of rows) m.set(snapKey(t, r), JSON.stringify(r));
  snapshots.set(projectId, m);
}
export const forgetSnapshot = (projectId: string) => snapshots.delete(projectId);

/** Carga el proyecto completo y deja la foto lista para guardar solo diferencias. */
export async function loadDbSnap(projectId: string): Promise<Db> {
  const db = await loadDb(projectId);
  takeSnapshot(projectId, db);
  return db;
}

export async function saveDb(projectId: string, db: Db) {
  const s = db.settings;
  const settingsRow = {
    project_id: projectId, currency: s.currency, country: s.country, ml_site: s.mlSite, tax_pct: s.taxPct, channels: s.channels,
    categories: s.categories, units: s.units, pay_methods: s.payMethods, expense_categories: s.expenseCategories,
    cogs_categories: s.cogsCategories, costs: s.costs, shipment_stages: s.shipmentStages ?? [], company: s.company ?? {}, brand: s.brand ?? {},
  };
  const snap = snapshots.get(projectId);
  const settingsJson = JSON.stringify({ ...settingsRow, name: s.name });
  if (!snap || snap.get("settings:1") !== settingsJson) {
    const { error } = await service().from("project_settings").upsert(settingsRow);
    if (error) throw new Error(`No se pudo guardar la configuración: ${error.message}`);
    await service().from("projects").update({ name: s.name }).eq("id", projectId);
  }
  const next = new Map(snap ?? []);
  next.set("settings:1", settingsJson);
  for (const [table, rows] of tableRows(projectId, db)) {
    const changed = rows.filter((r) => !snap || snap.get(snapKey(table, r)) !== JSON.stringify(r));
    await upsert(table, changed);
    for (const r of rows) next.set(snapKey(table, r), JSON.stringify(r));
  }
  snapshots.set(projectId, next);
}
