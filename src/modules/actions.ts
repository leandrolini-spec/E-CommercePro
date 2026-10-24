"use server";

import { carrierOf, isOwn } from "./carriers";
import { revalidatePath } from "next/cache";
import { isoDaysAgo, today } from "@/lib/format";
import { stockImpact, stockOf } from "./calc";
import { expenseIdOf } from "./partners";
import { defaultExpenseKind, purchaseIdOf, type ExpenseKind } from "./expenses";
import { looksLikeUser } from "./customers";
import { slugify, stageColor, stagesOf } from "./shipments";
import { customerOfShipment } from "./labels";
import { getDb, loadDemo, nextId, persist, resetToImported } from "./data";
import { STAGES, type Expense, type MovementType, type Product, type Stage } from "./types";
import { service } from "./repo/supabase";
import { isSupabase } from "./repo/supabase";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) ? v : 0;
};
const required = (v: string, label: string) => {
  if (!v) throw new Error(`Falta ${label}.`);
  return v;
};

/** Las categorías nuevas se suman solas a la lista (filtros y formularios). */
function addCategory(db: Awaited<ReturnType<typeof getDb>>, category: string) {
  if (category && !db.settings.categories.includes(category)) db.settings.categories.push(category);
}

/** Carga rápida de costo y precio (desde la lista de Productos). */
export async function quickPrices(id: string, fd: FormData) {
  const db = await getDb();
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new Error("No se encontró el producto.");
  if (str(fd, "cost") !== "") p.cost = num(fd, "cost");
  if (str(fd, "price") !== "") p.price = num(fd, "price");
  await persist(db);
  revalidatePath("/productos");
  revalidatePath("/");
  revalidatePath("/reportes");
}

/** Modo de stock del formulario: controlado (se cuenta), infinito (siempre hay) o sin control. */
function applyStockMode(p: { trackStock?: boolean; unlimited?: boolean }, fd: FormData) {
  const m = str(fd, "stockMode");
  if (m === "infinito") { p.trackStock = false; p.unlimited = true; }
  else if (m === "controlado") { p.trackStock = true; p.unlimited = false; }
  else if (m === "sin") { p.trackStock = false; p.unlimited = false; }
}

const kindOf = (fd: FormData) => (str(fd, "kind") === "consumible" ? "consumible" : str(fd, "kind") === "componente" ? "componente" : "venta") as "venta" | "componente" | "consumible";

export async function createProduct(fd: FormData) {
  const db = (await getDb());
  const sku = required(str(fd, "sku"), "el SKU");
  if (db.products.some((p) => p.sku === sku)) throw new Error("Ya existe un producto con ese SKU.");
  addCategory(db, str(fd, "category"));
  db.products.push({
    id: nextId("p"), sku, name: required(str(fd, "name"), "el nombre"), category: str(fd, "category"), brand: str(fd, "brand"),
    unit: str(fd, "unit") || "unidad", cost: num(fd, "cost"), price: num(fd, "price"), minStock: num(fd, "minStock"),
    maxStock: num(fd, "maxStock"), supplierId: str(fd, "supplierId"), active: true,
    kind: kindOf(fd), ...(kindOf(fd) === "consumible" ? { trackStock: false } : {}),
  });
  if (kindOf(fd) !== "consumible") applyStockMode(db.products[db.products.length - 1], fd);
  await persist();
  revalidatePath("/productos");
}

/**
 * Stock de un producto desde la sección Stock: "infinito" (siempre hay) o con cantidad (0 o más).
 * Con cantidad se registra un movimiento de "ajuste" por la diferencia, así el historial se conserva.
 * No aplica a kits (su stock sale de lo que llevan).
 */
export async function setProductStock(productId: string, fd: FormData): Promise<void | { error: string }> {
  const db = await getDb();
  const p = db.products.find((x) => x.id === productId);
  if (!p) return { error: "No se encontró el producto." };
  if (p.components?.length) return { error: "El stock de un kit sale de lo que lleva: cambiá el de sus componentes." };
  const wasUnlimited = !!p.unlimited;

  if (str(fd, "mode") === "infinito") {
    if (wasUnlimited) return; // ya estaba así: no hay nada que guardar
    p.unlimited = true; p.trackStock = false;
    await persist(db);
  } else {
    const raw = str(fd, "stock");
    const target = Number(raw.replace(",", "."));
    if (raw === "" || !Number.isInteger(target) || target < 0) return { error: "El stock tiene que ser un número entero, 0 o más." };
    const delta = target - stockOf(db, productId);
    if (delta === 0 && !wasUnlimited && p.trackStock !== false) return; // misma cantidad: nada que guardar
    p.unlimited = false; p.trackStock = true;
    if (delta !== 0) db.movements.push({ id: nextId("m"), productId, type: "ajuste", qty: delta, date: today(), reason: str(fd, "reason") || "Ajuste de stock (conteo)" });
    await persist(db);
  }
  for (const path of ["/stock", "/productos", "/"]) revalidatePath(path);
}

export async function createStockMovement(fd: FormData) {
  const db = (await getDb());
  const type = str(fd, "type") as MovementType;
  const qty = Math.abs(num(fd, "qty"));
  if (!qty) throw new Error("La cantidad debe ser mayor a cero.");
  const sign = type === "ingreso" || type === "devolucion" ? 1 : type === "ajuste" ? (str(fd, "direction") === "resta" ? -1 : 1) : -1;
  db.movements.push({
    id: nextId("m"), productId: required(str(fd, "productId"), "el producto"), type, qty: sign * qty, date: today(),
    reason: str(fd, "reason") || "—", unitCost: num(fd, "unitCost") || undefined,
  });
  await persist();
  revalidatePath("/stock");
  await persist();
  revalidatePath("/");
}

function supplierFields(fd: FormData) {
  return {
    name: required(str(fd, "name"), "el nombre"), company: str(fd, "company"), contactName: str(fd, "contactName"), category: str(fd, "category"),
    phone: str(fd, "phone"), email: str(fd, "email"), cuit: str(fd, "cuit"), address: str(fd, "address"), city: str(fd, "city"), website: str(fd, "website"),
    leadDays: num(fd, "leadDays"), payTerms: str(fd, "payTerms"), notes: str(fd, "notes"),
  };
}

export async function createSupplier(fd: FormData) {
  const db = await getDb();
  db.suppliers.push({ id: nextId("s"), ...supplierFields(fd) });
  await persist(db);
  revalidatePath("/proveedores");
}

export async function updateSupplier(id: string, fd: FormData) {
  const db = await getDb();
  const x = db.suppliers.find((s) => s.id === id);
  if (!x) throw new Error("No se encontró el proveedor.");
  Object.assign(x, supplierFields(fd));
  await persist(db);
  for (const path of ["/proveedores", "/gastos"]) revalidatePath(path);
}

export async function deleteSupplier(id: string) {
  const db = await getDb();
  // Las compras que tenía se conservan (con todo su historial y gasto): solo quedan sin proveedor asignado.
  for (const b of db.purchases) if (b.supplierId === id) b.supplierId = "";
  db.suppliers = db.suppliers.filter((s) => s.id !== id);
  // Primero se guardan las compras sin proveedor y recién después se borra el proveedor de la base.
  await persist(db);
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("suppliers").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  for (const path of ["/proveedores", "/gastos"]) revalidatePath(path);
}

/** Guarda los datos de un cliente o comprador. Si el nombre real cambia, el apodo de Mercado Libre queda guardado aparte. */
function applyCustomerData(db: Awaited<ReturnType<typeof getDb>>, id: string, fd: FormData, markFull: boolean) {
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new Error("No se encontró el cliente.");
  const name = str(fd, "name");
  if (markFull) required(name || (looksLikeUser(c) ? "" : c.name), "el nombre real");
  if (name && name !== c.name) {
    if (!c.nickname && looksLikeUser(c)) c.nickname = c.name; // el usuario de ML se guarda una sola vez y nunca se pisa
    c.name = name;
  }
  Object.assign(c, { company: str(fd, "company"), phone: str(fd, "phone"), email: str(fd, "email"), city: str(fd, "city"), address: str(fd, "address"), doc: str(fd, "doc"), notes: str(fd, "notes") });
  // Al guardar los datos, la Agenda vuelve a decidir sola (nombre + dirección + teléfono).
  c.agendaOff = false;
  syncShipmentsFromCustomer(db, c);
}

type DbT = Awaited<ReturnType<typeof getDb>>;

/** Los datos del contacto se copian a todos sus envíos (lo que esté cargado pisa lo viejo; lo vacío no borra nada). */
function syncShipmentsFromCustomer(db: DbT, c: DbT["customers"][number]) {
  const saleIds = new Set(db.sales.filter((s) => s.customerId === c.id).map((s) => s.id));
  for (const x of db.shipments ?? []) {
    if (!x.saleId || !saleIds.has(x.saleId)) continue;
    if (c.name && !looksLikeUser(c)) x.customer = c.name;
    if (c.phone) x.phone = c.phone;
    if (c.address) x.address = c.address;
    if (c.city) x.city = c.city;
  }
}

/** Al revés: lo que se carga en un envío completa la ficha del contacto, y la Agenda se actualiza sola. */
function syncCustomerFromShipment(db: DbT, x: NonNullable<DbT["shipments"]>[number]) {
  const sale = x.saleId ? db.sales.find((s) => s.id === x.saleId) : undefined;
  const c = sale ? db.customers.find((k) => k.id === sale.customerId) : undefined;
  if (!c) return;
  const name = x.customer?.trim();
  if (name && name !== c.name) {
    if (!c.nickname && looksLikeUser(c)) c.nickname = c.name;
    c.name = name;
  }
  if (x.phone?.trim()) c.phone = x.phone.trim();
  if (x.address?.trim()) c.address = x.address.trim();
  if (x.city?.trim()) c.city = x.city.trim();
  syncShipmentsFromCustomer(db, c);
}

/** “Guardar”: guarda los datos sin cambiar si el comprador es cliente con datos completos o no. */
export async function saveCustomerData(id: string, fd: FormData) {
  const db = await getDb();
  applyCustomerData(db, id, fd, false);
  await persist(db);
  for (const path of ["/clientes", "/mercadolibre", "/tiendanube", "/ventas", "/envios"]) revalidatePath(path);
}

/** “Convertir en cliente”: guarda los datos y pasa al comprador a Clientes con datos completos. */
export async function convertCustomer(id: string, fd: FormData) {
  const db = await getDb();
  applyCustomerData(db, id, fd, true);
  await persist(db);
  for (const path of ["/clientes", "/mercadolibre", "/tiendanube", "/ventas", "/envios"]) revalidatePath(path);
}

/**
 * Elimina un contacto del CRM. Sus compras y presupuestos se conservan (con todo su historial): solo quedan sin cliente asignado,
 * y los presupuestos guardan el nombre para que se sigan leyendo.
 */
export async function deleteCustomer(id: string) {
  const db = await getDb();
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new Error("No se encontró el contacto.");
  for (const s of db.sales) if (s.customerId === id) s.customerId = "";
  for (const q of db.quotes) if (q.customerId === id) { q.customerId = ""; q.customerName ||= c.name; q.customerPhone ||= c.phone; q.customerEmail ||= c.email; }
  db.customers = db.customers.filter((x) => x.id !== id);
  // Primero se guardan las ventas y presupuestos sin cliente y recién después se borra el contacto de la base.
  await persist(db);
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("customers").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  for (const path of ["/clientes", "/ventas", "/presupuestos", "/mercadolibre", "/tiendanube", "/mensajes"]) revalidatePath(path);
}

/** Vuelve a marcar un cliente como comprador común (sin datos completos); sus datos no se borran. */
export async function unmarkCustomerFull(id: string) {
  const db = await getDb();
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new Error("No se encontró el cliente.");
  c.agendaOff = true; // sale de la Agenda aunque tenga los datos; no se borra nada
  await persist(db);
  for (const path of ["/clientes", "/mercadolibre"]) revalidatePath(path);
}

export async function createCustomer(fd: FormData) {
  (await getDb()).customers.push({
    id: nextId("c"), name: required(str(fd, "name"), "el nombre"), company: str(fd, "company"), phone: str(fd, "phone"),
    email: str(fd, "email"), city: str(fd, "city"), origin: str(fd, "origin"), createdAt: today(),
    address: str(fd, "address"), doc: str(fd, "doc"), notes: str(fd, "notes"),
  });
  await persist();
  revalidatePath("/clientes");
}

/** Una compra suma el stock y crea sola el gasto correspondiente (para no cargarla dos veces). */
export async function createPurchase(fd: FormData) {
  const db = (await getDb());
  const productId = required(str(fd, "productId"), "el producto");
  const supplierId = required(str(fd, "supplierId"), "el proveedor");
  const qty = num(fd, "qty"), unitCost = num(fd, "unitCost"), shipping = num(fd, "shipping");
  if (qty <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  const date = str(fd, "date") || today();
  const id = nextId("b");
  db.purchases.push({ id, supplierId, date, status: "recibida", payMethod: str(fd, "payMethod"), shipping, items: [{ productId, qty, unitCost }] });
  // Los consumibles (embalaje, librería…) se pagan pero no llevan stock.
  if (db.products.find((p) => p.id === productId)?.kind !== "consumible")
    db.movements.push({ id: nextId("m"), productId, type: "ingreso", qty, date, reason: "Compra recibida", ref: id, unitCost });
  const product = db.products.find((p) => p.id === productId)?.name ?? "Producto";
  const supplier = db.suppliers.find((x) => x.id === supplierId)?.name ?? "";
  db.expenses.push({
    id: expenseIdOf(id), date, category: str(fd, "category") || "Productos", description: `Compra: ${product}${supplier ? ` (${supplier})` : ""}`,
    amount: qty * unitCost + shipping, payMethod: str(fd, "payMethod"), quantity: qty, paidBy: str(fd, "paidBy"), kitStock: str(fd, "kitStock") === "si",
    kind: db.products.find((p) => p.id === productId)?.kind === "consumible" ? "insumo" : "venta",
  });
  await persist();
  for (const path of ["/compras", "/stock", "/gastos", "/reportes", "/socios", "/"]) revalidatePath(path);
}

/** Datos de una compra (cabecera + un producto) volcados a la compra, su movimiento de stock y su gasto. */
function applyPurchase(db: Awaited<ReturnType<typeof getDb>>, id: string, fd: FormData) {
  const productId = required(str(fd, "productId"), "el producto");
  const supplierId = required(str(fd, "supplierId"), "el proveedor");
  const qty = num(fd, "qty"), unitCost = num(fd, "unitCost"), shipping = num(fd, "shipping");
  if (qty <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  const date = str(fd, "date") || today();
  const b = db.purchases.find((x) => x.id === id);
  if (!b) throw new Error("No se encontró la compra.");
  b.supplierId = supplierId; b.date = date; b.payMethod = str(fd, "payMethod"); b.shipping = shipping;
  b.items = [{ productId, qty, unitCost }];
  db.movements = db.movements.filter((m) => m.ref !== id);
  if (db.products.find((p) => p.id === productId)?.kind !== "consumible")
    db.movements.push({ id: nextId("m"), productId, type: "ingreso", qty, date, reason: "Compra recibida", ref: id, unitCost });
  const product = db.products.find((p) => p.id === productId)?.name ?? "Producto";
  const supplier = db.suppliers.find((x) => x.id === supplierId)?.name ?? "";
  const data = {
    kind: (db.products.find((p) => p.id === productId)?.kind === "consumible" ? "insumo" : "venta") as ExpenseKind,
    date, category: str(fd, "category") || "Productos", description: `Compra: ${product}${supplier ? ` (${supplier})` : ""}`,
    amount: qty * unitCost + shipping, payMethod: str(fd, "payMethod"), quantity: qty, paidBy: str(fd, "paidBy"), kitStock: str(fd, "kitStock") === "si",
  };
  const ex = db.expenses.find((e) => e.id === expenseIdOf(id));
  if (ex) Object.assign(ex, data);
  else db.expenses.push({ id: expenseIdOf(id), ...data });
}

/** Edita una compra: corrige también el stock y el gasto que se crearon con ella. */
export async function updatePurchase(id: string, fd: FormData) {
  const db = await getDb();
  applyPurchase(db, id, fd);
  await persist(db);
  for (const path of ["/compras", "/stock", "/gastos", "/reportes", "/socios", "/"]) revalidatePath(path);
}

/** Elimina una compra junto con su movimiento de stock y su gasto. */
export async function deletePurchase(id: string) {
  const db = await getDb();
  const exId = expenseIdOf(id);
  db.purchases = db.purchases.filter((b) => b.id !== id);
  db.movements = db.movements.filter((m) => m.ref !== id);
  db.expenses = db.expenses.filter((e) => e.id !== exId);
  // El guardado compara contra la última foto: los borrados hay que hacerlos explícitos en la base.
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    const pid = await activeProjectId();
    await service().from("stock_movements").delete().eq("project_id", pid).eq("ref", id);
    await service().from("expenses").delete().eq("project_id", pid).eq("id", exId);
    await service().from("purchases").delete().eq("project_id", pid).eq("id", id);
  }
  await persist(db);
  for (const path of ["/compras", "/stock", "/gastos", "/reportes", "/socios", "/"]) revalidatePath(path);
}

/** Al recibir una compra se suma stock, una sola vez (si ya está recibida no hace nada). */
export async function receivePurchase(id: string) {
  const db = (await getDb());
  const b = db.purchases.find((x) => x.id === id);
  if (!b || b.status === "recibida" || b.status === "cancelada") return;
  b.status = "recibida";
  for (const it of b.items.filter((i) => db.products.find((p) => p.id === i.productId)?.kind !== "consumible"))
    db.movements.push({ id: nextId("m"), productId: it.productId, type: "ingreso", qty: it.qty, date: today(), reason: "Compra recibida", ref: b.id, unitCost: it.unitCost });
  await persist();
  revalidatePath("/compras");
  await persist();
  revalidatePath("/stock");
  await persist();
  revalidatePath("/");
}

/** Cada venta nueva entra al seguimiento de Envíos en la primera etapa (Compra), con sus productos y canal. */
function addShipmentForSale(db: Awaited<ReturnType<typeof getDb>>, saleId: string, number: number, channel: string, items: { productId: string; qty: number }[], date: string, customer = "") {
  const stages = stagesOf(db.settings);
  const text = items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)?.name ?? "Producto"}`).join(" · ");
  (db.shipments ??= []).push({ id: nextId("s"), saleId, orderRef: `V-${number}`, channel, customer, phone: "", address: "", city: "", zip: "", items: text, notes: "", tracking: "", stage: stages[0].id, createdAt: date });
}

/** Descuenta el stock de una venta apenas se registra (un kit descuenta cada componente). */
function deductStock(db: Awaited<ReturnType<typeof getDb>>, items: { productId: string; qty: number }[], date: string, ref: string) {
  for (const it of items)
    for (const m of stockImpact(db, it.productId, it.qty))
      db.movements.push({ id: nextId("m"), productId: m.productId, type: "egreso", qty: -m.qty, date, reason: "Venta", ref });
}

export async function createSale(fd: FormData) {
  const db = (await getDb());
  const productId = required(str(fd, "productId"), "el producto");
  const qty = num(fd, "qty");
  if (qty <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  const number = Math.max(1000, ...db.sales.map((s) => s.number)) + 1;
  db.sales.push({
    id: nextId("v"), number, customerId: required(str(fd, "customerId"), "el cliente"), date: today(), channel: str(fd, "channel"),
    status: "pendiente", payMethod: str(fd, "payMethod"), extraCosts: num(fd, "extraCosts"),
    items: [{ productId, qty, unitPrice: num(fd, "unitPrice"), discountPct: num(fd, "discountPct") }],
    ...(str(fd, "netAmount") ? { netAmount: num(fd, "netAmount") } : {}),
    payStatus: "cobrada",
  });
  deductStock(db, [{ productId, qty }], today(), `V-${number}`);
  addShipmentForSale(db, db.sales[db.sales.length - 1].id, number, str(fd, "channel"), [{ productId, qty }], today(), db.customers.find((c) => c.id === str(fd, "customerId"))?.name ?? "");
  await persist(db);
  revalidatePath("/envios");
  revalidatePath("/ventas");
  revalidatePath("/pedidos");
  revalidatePath("/stock");
  revalidatePath("/");
}

/** Venta cargada a mano (Instagram, WhatsApp, Meta…): crea o reutiliza al cliente, descuenta el stock y entra sola a Envíos con sus datos de entrega. */
export type ManualSaleInput = {
  channel: string; date: string; customerId: string; name: string; phone: string; dni: string; address: string; city: string; zip: string; handle: string;
  items: { productId: string; qty: number; unitPrice: number; discountPct: number }[];
  carrier: string; eta: string; extraCosts: number; payMethod: string; notes: string;
};
async function manualSale(input: ManualSaleInput): Promise<void | { error: string }> {
  const db = await getDb();
  const t = (v: unknown) => String(v ?? "").trim();
  const channel = t(input.channel), name = t(input.name), phone = t(input.phone), address = t(input.address), city = t(input.city);
  if (!channel) return { error: "Elegí el canal de venta." };
  if (!name) return { error: "Falta el nombre del cliente." };
  if (phone.replace(/\D/g, "").length < 6) return { error: "Falta el teléfono del cliente (mínimo 6 dígitos)." };
  if (!address) return { error: "Falta la dirección de entrega." };
  if (!city) return { error: "Falta la localidad." };
  const items = (input.items ?? []).filter((i) => i.productId && Number(i.qty) > 0).map((i) => ({ productId: i.productId, qty: Number(i.qty), unitPrice: Math.max(0, Number(i.unitPrice) || 0), discountPct: Math.min(100, Math.max(0, Number(i.discountPct) || 0)) }));
  if (!items.length) return { error: "Agregá al menos un producto con cantidad." };
  if (items.some((i) => !db.products.some((p) => p.id === i.productId))) return { error: "Hay un producto que ya no existe. Volvé a elegirlo." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t(input.date)) ? t(input.date) : today();

  // Cliente: el elegido, o uno que ya tenga ese teléfono (mismos últimos 10 dígitos), o uno nuevo. Al existente solo se le completa lo que le falte.
  const last10 = (v: string) => v.replace(/\D/g, "").slice(-10);
  let customer = db.customers.find((c) => c.id === t(input.customerId)) ?? db.customers.find((c) => last10(c.phone ?? "") === last10(phone) && last10(phone).length >= 6);
  if (customer) {
    if (!customer.phone) customer.phone = phone;
    if (!customer.address) customer.address = address;
    if (!customer.city) customer.city = city;
    if (!customer.nickname && t(input.handle)) customer.nickname = t(input.handle);
    if (!customer.doc && t(input.dni)) customer.doc = t(input.dni);
  } else {
    customer = { id: nextId("c"), name, company: "", phone, email: "", city, origin: channel, createdAt: today(), address, doc: t(input.dni), notes: "", nickname: t(input.handle) };
    db.customers.push(customer);
  }

  const number = Math.max(1000, ...db.sales.map((x) => x.number)) + 1;
  const sale = {
    id: nextId("v"), number, customerId: customer.id, date, channel, status: "pendiente" as const, payMethod: t(input.payMethod),
    extraCosts: Math.max(0, Number(input.extraCosts) || 0), items, payStatus: "cobrada" as const,
  };
  db.sales.push(sale);
  deductStock(db, items.map((i) => ({ productId: i.productId, qty: i.qty })), date, `V-${number}`);
  addShipmentForSale(db, sale.id, number, channel, items, date, customer.name);
  const sh = db.shipments![db.shipments!.length - 1];
  Object.assign(sh, { phone, address, city, zip: t(input.zip), carrier: carrierOf(input.carrier), notes: t(input.notes), ...(/^\d{4}-\d{2}-\d{2}$/.test(t(input.eta)) ? { eta: t(input.eta) } : {}) });
  await persist(db);
  for (const path of ["/ventas", "/envios", "/clientes", "/pedidos", "/stock", "/productos", "/"]) revalidatePath(path);
}

export async function createManualSale(input: ManualSaleInput): Promise<void | { error: string }> {
  // En producción Next oculta el texto de los errores que se lanzan: se devuelve como dato para que el formulario muestre el motivo real.
  try { return await manualSale(input); } catch (e) { return { error: `No se pudo guardar la venta: ${(e as Error).message || "error desconocido"}` }; }
}

/** Planilla de ventas: una sola venta con todos los productos que tengan cantidad, por un canal. Descuenta el stock de cada uno. */
export async function registerSalesBulk(fd: FormData) {
  const db = await getDb();
  const channel = required(str(fd, "channel"), "el canal de venta");
  const date = str(fd, "date") || today();
  const items: { productId: string; qty: number; unitPrice: number; discountPct: number }[] = [];
  for (const p of db.products) {
    const qty = num(fd, `q_${p.id}`);
    if (qty > 0) items.push({ productId: p.id, qty, unitPrice: p.price, discountPct: 0 });
  }
  if (!items.length) throw new Error("Escribí la cantidad vendida de al menos un producto.");
  const number = Math.max(1000, ...db.sales.map((x) => x.number)) + 1;
  db.sales.push({ id: nextId("v"), number, customerId: "", date, channel, status: "entregado", payMethod: str(fd, "payMethod"), extraCosts: 0, items, payStatus: "cobrada" });
  deductStock(db, items, date, `V-${number}`);
  addShipmentForSale(db, db.sales[db.sales.length - 1].id, number, channel, items, date);
  await persist(db);
  revalidatePath("/envios");
  for (const path of ["/stock", "/ventas", "/productos", "/"]) revalidatePath(path);
}

/** Registra una venta elegiendo el producto en el formulario (botón general de Stock). */
export async function registerSaleAny(fd: FormData) {
  return registerSale(str(fd, "productId"), fd);
}

/** "Registrar venta" desde Stock: registra la venta con su canal y descuenta el stock solo. */
export async function registerSale(productId: string, fd: FormData) {
  const db = await getDb();
  const p = db.products.find((x) => x.id === productId);
  if (!p) throw new Error("No se encontró el producto.");
  const qty = num(fd, "qty");
  if (qty <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  const channel = required(str(fd, "channel"), "el canal de venta");
  const date = str(fd, "date") || today();
  const number = Math.max(1000, ...db.sales.map((x) => x.number)) + 1;
  db.sales.push({
    id: nextId("v"), number, customerId: "", date, channel, status: "entregado", payMethod: str(fd, "payMethod"), extraCosts: 0,
    items: [{ productId, qty, unitPrice: num(fd, "unitPrice") || p.price, discountPct: 0 }], payStatus: "cobrada",
  });
  deductStock(db, [{ productId, qty }], date, `V-${number}`);
  addShipmentForSale(db, db.sales[db.sales.length - 1].id, number, channel, [{ productId, qty }], date);
  await persist(db);
  revalidatePath("/envios");
  for (const path of ["/stock", "/ventas", "/productos", "/"]) revalidatePath(path);
}

const NEXT_STATUS = { pendiente: "preparando", preparando: "enviado", enviado: "entregado" } as const;
/** Avanza el pedido. Al pasar a "enviado" se descuenta el stock. */
export async function advanceSale(id: string) {
  const db = (await getDb());
  const s = db.sales.find((x) => x.id === id);
  if (!s || !(s.status in NEXT_STATUS)) return;
  const next = NEXT_STATUS[s.status as keyof typeof NEXT_STATUS];
  s.status = next;
  await persist();
  revalidatePath("/pedidos");
  await persist();
  revalidatePath("/ventas");
  await persist();
  revalidatePath("/stock");
  await persist();
  revalidatePath("/");
}

const newShareToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export type QuotePayload = {
  customerId: string; customerName: string; customerPhone: string; customerEmail: string; discountPct: number; taxPct: number; shipping: number; validDays: number; notes: string;
  items: { productId: string; qty: number; unitPrice: number; description: string }[];
};

/** Crea o edita un presupuesto con varias líneas, descuento, impuestos y logística. */
export async function saveQuote(id: string | null, payload: QuotePayload) {
  const db = await getDb();
  const items = payload.items
    .map((i) => ({ productId: i.productId, qty: Number(i.qty) || 0, unitPrice: Number(i.unitPrice) || 0, description: (i.description ?? "").trim() }))
    .filter((i) => i.qty > 0 && (i.productId || i.description));
  if (!items.length) throw new Error("Agregá al menos un producto con cantidad.");
  const customerName = payload.customerName.trim() || db.customers.find((c) => c.id === payload.customerId)?.name || "";
  if (!customerName) throw new Error("Elegí un cliente o escribí su nombre.");
  const fields = {
    customerId: payload.customerId, customerName, customerPhone: (payload.customerPhone ?? "").trim(), customerEmail: (payload.customerEmail ?? "").trim(), discountPct: Math.max(0, Number(payload.discountPct) || 0), taxPct: Math.max(0, Number(payload.taxPct) || 0),
    shipping: Math.max(0, Number(payload.shipping) || 0), notes: payload.notes.trim(), items,
  };
  if (id) {
    const q = db.quotes.find((x) => x.id === id);
    if (!q) throw new Error("No se encontró el presupuesto.");
    Object.assign(q, fields, { validUntil: isoDaysAgo(-(Number(payload.validDays) || 15)) });
    if (!q.shareToken) q.shareToken = newShareToken();
  } else {
    const number = Math.max(0, ...db.quotes.map((q) => q.number)) + 1;
    db.quotes.push({ id: nextId("q"), number, date: today(), validUntil: isoDaysAgo(-(Number(payload.validDays) || 15)), status: "borrador", shareToken: newShareToken(), ...fields });
  }
  await persist(db);
  revalidatePath("/presupuestos");
}

export async function deleteQuote(id: string) {
  const db = await getDb();
  db.quotes = db.quotes.filter((q) => q.id !== id);
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("quotes").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  await persist(db);
  revalidatePath("/presupuestos");
}

export async function setQuoteStatus(id: string, status: "enviado" | "aceptado" | "rechazado") {
  const q = (await getDb()).quotes.find((x) => x.id === id);
  if (q) q.status = status;
  await persist();
  revalidatePath("/presupuestos");
}

/** Tipo del gasto: el elegido o el que corresponde a la categoría; si es una categoría nueva (Contador, Dominio…), es un gasto de la empresa. */
const kindOfExpense = (fd: FormData, category: string): ExpenseKind => {
  const k = str(fd, "kind");
  const kind = (["venta", "insumo", "inversion"].includes(k) ? k : defaultExpenseKind(category)) as ExpenseKind | "";
  return kind || "insumo";
};

/** Las categorías de gasto nuevas (Contador, Dominio…) se suman solas a la lista. */
function addExpenseCategory(db: Awaited<ReturnType<typeof getDb>>, category: string) {
  if (category && !db.settings.expenseCategories.includes(category)) db.settings.expenseCategories.push(category);
}

/** Quita una compra ligada a un gasto, con su movimiento de stock (también en la base). */
async function removeLinkedPurchase(db: Awaited<ReturnType<typeof getDb>>, pid: string) {
  db.purchases = db.purchases.filter((b) => b.id !== pid);
  db.movements = db.movements.filter((m) => m.ref !== pid);
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    const projectId = await activeProjectId();
    await service().from("stock_movements").delete().eq("project_id", projectId).eq("ref", pid);
    await service().from("purchases").delete().eq("project_id", projectId).eq("id", pid);
  }
}

/** Código de producto que no usa ningún otro (el código es único: si el siguiente número ya existe, se sigue con el próximo). */
function freeSku(db: Awaited<ReturnType<typeof getDb>>, prefix: string, from: number, pad = 2) {
  const used = new Set(db.products.map((p) => p.sku));
  let n = from;
  while (used.has(`${prefix}-${String(n).padStart(pad, "0")}`)) n++;
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

/**
 * Cada gasto se replica solo según su tipo:
 *  - "Para vender": queda como compra en la solapa Compras (y suma stock si se indicó el producto).
 *  - "Insumo de la empresa" / "Inversión": queda en la solapa Insumos de la empresa.
 * Si el gasto cambia de tipo o se borra, lo replicado se corrige o se quita.
 */
async function syncExpenseLinks(db: Awaited<ReturnType<typeof getDb>>, e: Expense, productId = "") {
  const pid = purchaseIdOf(e.id);
  let existing = db.purchases.find((b) => b.id === pid);
  const prev = existing ? db.products.find((p) => p.id === existing!.items[0]?.productId) : undefined;
  const wantInsumo = e.kind === "insumo" || e.kind === "inversion";
  const wantMerch = e.kind === "venta";
  const mismatch = (wantInsumo && prev && prev.kind !== "consumible") || (wantMerch && prev?.kind === "consumible") || (!wantInsumo && !wantMerch);
  if (existing && mismatch) { await removeLinkedPurchase(db, pid); existing = undefined; }
  if (!wantInsumo && !wantMerch) return;

  const qty = e.quantity && e.quantity > 0 ? e.quantity : 1;
  const unit = Math.round((e.amount / qty) * 10000) / 10000;
  const supplierId = existing?.supplierId ?? db.suppliers[0]?.id ?? "";
  let product: Product | undefined;
  if (wantInsumo) {
    const name = e.description.trim();
    product = (prev && prev.kind === "consumible" ? prev : undefined) ?? db.products.find((p) => p.kind === "consumible" && p.name.trim().toLowerCase() === name.toLowerCase());
    if (!product) {
      product = { id: nextId("p"), sku: freeSku(db, "INS", db.products.filter((p) => p.kind === "consumible").length + 1), name, category: e.category, brand: "", unit: "unidad", cost: unit, price: 0, minStock: 0, maxStock: 0, supplierId: "", active: true, trackStock: false, kind: "consumible" };
      db.products.push(product);
      if (e.category && !db.settings.categories.includes(e.category)) db.settings.categories.push(e.category);
    } else product.cost = unit;
  } else {
    product = (productId ? db.products.find((p) => p.id === productId) : undefined) ?? (prev && prev.kind !== "consumible" ? prev : undefined);
    if (!product) {
      // Sin producto elegido: queda una compra "varios" de esa categoría, sin control de stock.
      const label = `Compras varias · ${e.category || "Mercadería"}`;
      product = db.products.find((p) => p.name === label);
      if (!product) {
        product = { id: nextId("p"), sku: freeSku(db, "VAR", db.products.length + 1, 3), name: label, category: e.category, brand: "", unit: "unidad", cost: 0, price: 0, minStock: 0, maxStock: 0, supplierId: "", active: false, trackStock: false, kind: "venta" };
        db.products.push(product);
      }
    }
  }
  const item = { productId: product.id, qty, unitCost: unit };
  if (existing) Object.assign(existing, { date: e.date, payMethod: e.payMethod, shipping: 0, items: [item] });
  else db.purchases.push({ id: pid, supplierId, date: e.date, status: "recibida", payMethod: e.payMethod, shipping: 0, items: [item] });
  // El stock de la mercadería sube con la compra (los insumos no llevan stock).
  db.movements = db.movements.filter((m) => m.ref !== pid);
  if (wantMerch && product.trackStock !== false && product.kind !== "consumible")
    db.movements.push({ id: nextId("m"), productId: product.id, type: "ingreso", qty, date: e.date, reason: "Compra recibida", ref: pid, unitCost: unit });
}

export async function createExpense(fd: FormData) {
  const db = await getDb();
  const amount = num(fd, "amount");
  if (amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  const category = str(fd, "category");
  addExpenseCategory(db, category);
  const e: Expense = {
    id: nextId("e"), date: str(fd, "date") || today(), category, description: required(str(fd, "description"), "la descripción"),
    amount, payMethod: str(fd, "payMethod"), quantity: num(fd, "quantity") || 1, paidBy: str(fd, "paidBy"), kitStock: str(fd, "kitStock") === "si", kind: kindOfExpense(fd, category),
  };
  db.expenses.push(e);
  await syncExpenseLinks(db, e, str(fd, "productId"));
  await persist(db);
  for (const path of ["/gastos", "/productos", "/stock", "/reportes", "/socios", "/"]) revalidatePath(path);
}

export async function updateExpense(id: string, fd: FormData) {
  const db = await getDb();
  const e = db.expenses.find((x) => x.id === id);
  if (!e) throw new Error("No se encontró el gasto.");
  const amount = num(fd, "amount");
  if (amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  const category = str(fd, "category");
  addExpenseCategory(db, category);
  Object.assign(e, {
    date: str(fd, "date") || e.date, category, description: required(str(fd, "description"), "la descripción"),
    amount, payMethod: str(fd, "payMethod"), quantity: num(fd, "quantity") || 1, paidBy: str(fd, "paidBy"), kitStock: str(fd, "kitStock") === "si", kind: kindOfExpense(fd, category),
  });
  await syncExpenseLinks(db, e, str(fd, "productId"));
  await persist(db);
  for (const path of ["/gastos", "/productos", "/stock", "/reportes", "/socios", "/"]) revalidatePath(path);
}

export async function deleteExpense(id: string) {
  const db = await getDb();
  const e = db.expenses.find((x) => x.id === id);
  db.expenses = db.expenses.filter((x) => x.id !== id);
  // El guardado compara contra la última foto: un borrado hay que hacerlo explícito en la base.
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("expenses").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  if (e) await syncExpenseLinks(db, { ...e, kind: undefined });
  await persist(db);
  for (const path of ["/gastos", "/productos", "/compras", "/reportes", "/socios", "/"]) revalidatePath(path);
}

export async function createCashMovement(fd: FormData) {
  const amount = num(fd, "amount");
  if (amount <= 0) throw new Error("El importe debe ser mayor a cero.");
  (await getDb()).cash.push({
    id: nextId("k"), date: str(fd, "date") || today(), type: str(fd, "type") === "egreso" ? "egreso" : "ingreso",
    account: str(fd, "account"), concept: required(str(fd, "concept"), "el concepto"), amount,
  });
  await persist();
  revalidatePath("/caja");
}

export async function createOpportunity(fd: FormData) {
  (await getDb()).opportunities.push({
    id: nextId("o"), name: required(str(fd, "name"), "el nombre"), customerName: str(fd, "customerName"), origin: str(fd, "origin"),
    value: num(fd, "value"), stage: "Nuevo", probability: 10, dueDate: str(fd, "dueDate") || today(), nextAction: str(fd, "nextAction"),
  });
  await persist();
  revalidatePath("/crm");
}

const PROB: Record<Stage, number> = { Nuevo: 10, Contactado: 25, Interesado: 40, Presupuesto: 60, Negociación: 75, Ganado: 100, Perdido: 0 };
export async function moveOpportunity(id: string, stage: string) {
  const o = (await getDb()).opportunities.find((x) => x.id === id);
  if (!o || !(STAGES as readonly string[]).includes(stage)) return;
  o.stage = stage as Stage;
  o.probability = PROB[o.stage];
  await persist();
  revalidatePath("/crm");
}

export async function updateSettings(fd: FormData) {
  const s = (await getDb()).settings;
  s.name = required(str(fd, "name"), "el nombre comercial");
  s.currency = str(fd, "currency") || s.currency;
  s.country = str(fd, "country") || s.country;
  s.taxPct = num(fd, "taxPct");
  s.costs = { logisticsPerShipment: num(fd, "logistics"), boxPerPack: num(fd, "boxPerPack"), gncPct: num(fd, "gncPct") };
  await persist();
  revalidatePath("/", "layout");
}

/** Edita una lista de Configuración (canales de venta, categorías, formas de pago…), separada por comas. */
export async function updateList(key: "channels" | "categories" | "payMethods" | "expenseCategories", fd: FormData) {
  const db = await getDb();
  const values = [...new Set(str(fd, "values").split(",").map((v) => v.trim()).filter(Boolean))];
  if (!values.length) throw new Error("La lista no puede quedar vacía.");
  if (key === "channels" && !values.includes("Mercado Libre")) values.unshift("Mercado Libre");
  db.settings[key] = values;
  await persist(db);
  revalidatePath("/", "layout");
}

/** Publicación de un producto en un canal (Tienda Nube, Instagram, Meta…). Sin estado = se quita. Mercado Libre se lee solo. */
export async function setListing(productId: string, fd: FormData) {
  const db = await getDb();
  const p = db.products.find((x) => x.id === productId);
  if (!p) throw new Error("No se encontró el producto.");
  const channel = required(str(fd, "channel"), "el canal");
  if (channel === "Mercado Libre") throw new Error("Mercado Libre se lee solo: para cambiarlo, editá la publicación en Mercado Libre.");
  const status = str(fd, "status") as "active" | "out_of_stock" | "paused" | "";
  const rest = (p.listings ?? []).filter((l) => l.channel !== channel);
  p.listings = status ? [...rest, { channel, status, price: num(fd, "price") || p.price, url: str(fd, "url") }] : rest;
  await persist(db);
  for (const path of ["/productos", "/stock", "/"]) revalidatePath(path);
}

export async function loadDemoData() {
  loadDemo();
  revalidatePath("/", "layout");
}

export async function restoreImportedData() {
  resetToImported();
  await persist();
  revalidatePath("/", "layout");
}

export async function updateProduct(id: string, fd: FormData) {
  const db = await getDb();
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new Error("No se encontró el producto.");
  p.name = required(str(fd, "name"), "el nombre");
  p.sku = required(str(fd, "sku"), "el SKU");
  p.category = str(fd, "category");
  addCategory(db, p.category);
  if (fd.has("kind")) { p.kind = kindOf(fd); if (p.kind === "consumible") p.trackStock = false; }
  // "¿Es un kit?": con "no" se le quitan los componentes; con "sí" se guardan los que se hayan elegido.
  if (str(fd, "isKit") === "no") p.components = [];
  else if (fd.has("comp1")) {
    p.components = [1, 2, 3, 4, 5, 6]
      .map((i) => ({ productId: str(fd, `comp${i}`), qty: num(fd, `qty${i}`) }))
      .filter((c) => c.productId && c.productId !== p.id && c.qty > 0);
  }
  if (fd.has("description")) p.description = str(fd, "description");
  if (fd.has("brand")) p.brand = str(fd, "brand");
  if (fd.has("supplierId")) p.supplierId = str(fd, "supplierId");
  if (fd.has("minStock")) p.minStock = num(fd, "minStock");
  if (fd.has("maxStock")) p.maxStock = num(fd, "maxStock");
  if (fd.has("active")) p.active = str(fd, "active") !== "no";
  if (fd.has("stockMode") && p.kind !== "consumible") applyStockMode(p, fd);
  if (!p.components?.length) p.cost = num(fd, "cost");
  p.price = num(fd, "price");
  const pack = num(fd, "packSize");
  p.packSize = pack > 0 ? pack : undefined;
  await persist();
  revalidatePath("/productos");
  revalidatePath("/");
  revalidatePath("/reportes");
}

/** Adelanto a un socio: no es un gasto, queda en su propia cuenta. */
export async function createAdvance(fd: FormData) {
  const db = await getDb();
  const amount = num(fd, "amount");
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
  const partner = str(fd, "partnerNew") || required(str(fd, "partner"), "quién retiró");
  (db.advances ??= []).push({ id: nextId("adv"), date: str(fd, "date") || today(), partner, amount, note: str(fd, "note"), kind: "retiro" });
  await persist();
  revalidatePath("/socios");
  revalidatePath("/reportes");
}

export async function deleteAdvance(id: string) {
  const db = await getDb();
  db.advances = (db.advances ?? []).filter((a) => a.id !== id);
  // El guardado compara contra la última foto: un borrado hay que hacerlo explícito en la base.
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("partner_advances").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  await persist();
  revalidatePath("/socios");
  revalidatePath("/reportes");
}

/** Movimiento de un socio puntual: retiro (saca plata) o inversión (pone plata). */
export async function createMovement(partner: string, kind: "retiro" | "inversion", fd: FormData) {
  const db = await getDb();
  const amount = num(fd, "amount");
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
  (db.advances ??= []).push({ id: nextId("adv"), date: str(fd, "date") || today(), partner, amount, note: str(fd, "note"), kind });
  await persist();
  revalidatePath("/socios");
  revalidatePath("/reportes");
}

/* ---------- Envíos ---------- */

const shipPaths = () => { revalidatePath("/envios"); };

function shipmentFields(fd: FormData) {
  const f: Record<string, string> = {
    customer: str(fd, "customer"), phone: str(fd, "phone"), address: str(fd, "address"), city: str(fd, "city"), zip: str(fd, "zip"), items: str(fd, "items"),
    notes: str(fd, "notes"), tracking: str(fd, "tracking"), channel: str(fd, "channel"), orderRef: str(fd, "orderRef"),
  };
  // Los datos del chofer ya no están en el formulario: solo se tocan si el formulario los trae.
  for (const k of ["courier", "courierPhone", "vehicle", "plate", "carrier"]) if (fd.has(k)) f[k] = str(fd, k);
  if (f.carrier !== undefined) f.carrier = carrierOf(f.carrier);
  return f as { customer: string; phone: string; address: string; city: string; zip: string; items: string; notes: string; tracking: string; channel: string; orderRef: string; courier?: string; courierPhone?: string; vehicle?: string; plate?: string; carrier?: string };
}

/** Nuevo envío cargado a mano (ventas por WhatsApp, Instagram, Tienda Nube…). */
export async function createShipment(fd: FormData) {
  const db = await getDb();
  const f = shipmentFields(fd);
  required(f.customer, "el cliente");
  const stages = stagesOf(db.settings);
  const stage = str(fd, "stage") || stages[0].id;
  const ship = { id: nextId("s"), ...f, stage, createdAt: today(), dispatchedAt: str(fd, "dispatchedAt") || undefined };
  (db.shipments ??= []).push(ship);
  saveShipmentDoc(db, ship, str(fd, "dni"));
  await persist(db);
  shipPaths();
  revalidatePath("/clientes");
}

/** El DNI del destinatario vive en su ficha de cliente: si el envío no tiene una (se cargó suelto), se busca por teléfono o se crea. */
function saveShipmentDoc(db: DbT, x: NonNullable<DbT["shipments"]>[number], dniRaw: string) {
  const dni = dniRaw.replace(/\D/g, "");
  if (!dni) return;
  let c = customerOfShipment(db, x);
  if (!c) {
    c = { id: nextId("c"), name: x.customer, company: "", phone: x.phone, email: "", city: x.city, origin: x.channel || "Envío", createdAt: today(), address: x.address, doc: "", notes: "" };
    db.customers.push(c);
  }
  c.doc = dni;
}

/** Edita un envío: datos del cliente, productos, destino, fechas y etapa. */
export async function updateShipment(id: string, fd: FormData) {
  const db = await getDb();
  const x = db.shipments?.find((s) => s.id === id);
  if (!x) throw new Error("No se encontró el envío.");
  const f = shipmentFields(fd);
  required(f.customer, "el cliente");
  Object.assign(x, f);
  if (f.carrier !== undefined) x.carrier = carrierOf(f.carrier);
  if (fd.has("dispatchedAt")) x.dispatchedAt = str(fd, "dispatchedAt") || undefined;
  if (fd.has("deliveredAt")) x.deliveredAt = str(fd, "deliveredAt") || undefined;
  if (fd.has("eta")) x.eta = str(fd, "eta") || undefined;
  const stage = str(fd, "stage");
  if (stage) x.stage = stage;
  syncCustomerFromShipment(db, x);
  // El DNI vive en la ficha del cliente (de ahí lo toma la etiqueta).
  if (fd.has("dni")) {
    if (str(fd, "dni")) saveShipmentDoc(db, x, str(fd, "dni"));
    else { const c = customerOfShipment(db, x); if (c) c.doc = ""; }
  }
  await persist(db);
  shipPaths();
  for (const path of ["/clientes", "/mercadolibre", "/tiendanube", "/etiquetas"]) revalidatePath(path);
}

/** Mueve un envío a otra etapa. Al pasar a "En viaje" se anota la fecha de salida; al entregarse, la de entrega. */
export async function moveShipment(id: string, stage: string) {
  const db = await getDb();
  const x = db.shipments?.find((s) => s.id === id);
  if (!x) throw new Error("No se encontró el envío.");
  x.stage = stage;
  if (stage === "en_viaje" && !x.dispatchedAt) x.dispatchedAt = today();
  // Al salir "En viaje" se anota el chofer de reparto que está cargado (queda guardado aunque después cambie).
  const c = db.settings.company ?? {};
  // Solo en reparto propio: con Logística o Vía Cargo no se sabe quién entrega, así que no se anota chofer.
  if (stage === "en_viaje" && isOwn(x.carrier) && !x.courier && c.driverActive && c.driverName) { x.courier = c.driverName; x.courierPhone = c.driverPhone ?? ""; x.vehicle = c.driverVehicle ?? ""; x.plate = c.driverPlate ?? ""; }
  if (stage === "entregado" && !x.deliveredAt) x.deliveredAt = today();
  await persist(db);
  shipPaths();
}

export async function deleteShipment(id: string) {
  const db = await getDb();
  db.shipments = (db.shipments ?? []).filter((s) => s.id !== id);
  if (isSupabase()) {
    const { activeProjectId } = await import("./repo/supabase");
    await service().from("shipments").delete().eq("project_id", await activeProjectId()).eq("id", id);
  }
  await persist(db);
  shipPaths();
}

/**
 * Etapas del seguimiento, separadas por coma y en el orden que se quiere. Una etapa que ya existe conserva su identidad y color
 * (también al reordenarla); una nueva se crea. Los envíos de una etapa eliminada quedan en la primera.
 */
export async function saveShipmentStages(fd: FormData) {
  const db = await getDb();
  const names = [...new Set(str(fd, "stages").split(",").map((v) => v.trim()).filter(Boolean))];
  if (!names.length) throw new Error("Tiene que haber al menos una etapa.");
  const current = stagesOf(db.settings);
  // Mensajes de WhatsApp: una línea por etapa con el formato  Etapa: texto del mensaje.
  const msgs = new Map(str(fd, "messages").split("\n").map((l) => l.split(/:([\s\S]*)/)).filter((p) => p.length > 1 && p[0].trim() && p[1].trim()).map((p) => [p[0].trim().toLowerCase(), p[1].trim().replace(/\\n/g, "\n")]));
  const used = new Set<string>();
  const next = names.map((name, i) => {
    const same = current.find((c) => c.name.toLowerCase() === name.toLowerCase());
    let id = same?.id ?? slugify(name);
    while (used.has(id)) id += "_2";
    used.add(id);
    return { id, name, color: same?.color ?? stageColor(current.length + i), message: msgs.get(name.toLowerCase()) ?? same?.message };
  });
  db.settings.shipmentStages = next;
  const valid = new Set(next.map((s) => s.id));
  for (const x of db.shipments ?? []) if (!valid.has(x.stage)) x.stage = next[0].id;
  await persist(db);
  shipPaths();
}


/* ---------- Kits ---------- */

export type KitPayload = { name: string; price: number; description: string; items: { productId: string; qty: number }[] };

/** Crea un kit de venta con los productos elegidos: su costo y su stock salen solos de lo que lleva. */
export async function createKit(payload: KitPayload) {
  const db = await getDb();
  const name = payload.name.trim();
  if (!name) throw new Error("Poné un nombre al kit.");
  const items = payload.items.map((i) => ({ productId: i.productId, qty: Math.max(1, Math.round(Number(i.qty) || 1)) })).filter((i) => db.products.some((p) => p.id === i.productId));
  if (items.length < 2) throw new Error("Un kit lleva al menos 2 productos.");
  const lines = items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)!.name}`);
  const nextNumber = db.products.filter((p) => p.components?.length).length + 1;
  db.products.push({
    id: nextId("p"), sku: `KIT-${String(nextNumber).padStart(2, "0")}-${nextId("k").slice(-3).toUpperCase()}`, name, category: "Kits", brand: "", unit: "unidad",
    cost: 0, price: Math.max(0, Number(payload.price) || 0), minStock: 0, maxStock: 0, supplierId: "", active: true, kind: "venta", trackStock: true,
    components: items, description: payload.description.trim() || `Kit de venta: ${lines.join(" + ")}`,
  });
  if (!db.settings.categories.includes("Kits")) db.settings.categories.push("Kits");
  await persist(db);
  for (const path of ["/productos", "/stock", "/"]) revalidatePath(path);
}

/** Deshace un kit: los productos que lo formaban siguen como están. Si el kit ya tuvo ventas, queda inactivo para no perder el historial. */
export async function deleteKit(id: string) {
  const db = await getDb();
  const kit = db.products.find((p) => p.id === id);
  if (!kit?.components?.length) throw new Error("No es un kit.");
  if (db.sales.some((s) => s.items.some((i) => i.productId === id))) {
    kit.active = false;
  } else {
    db.products = db.products.filter((p) => p.id !== id);
    if (isSupabase()) {
      const { activeProjectId } = await import("./repo/supabase");
      await service().from("products").delete().eq("project_id", await activeProjectId()).eq("id", id);
    }
  }
  await persist(db);
  for (const path of ["/productos", "/stock", "/"]) revalidatePath(path);
}

/** Marca que ya se le mandó la bienvenida al comprador: sale de "Nuevos compradores". */
export async function markWelcomed(saleId: string) {
  const db = await getDb();
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;
  s.welcomed = true;
  s.welcomedAt = today();
  await persist(db);
  for (const path of ["/ventas", "/mercadolibre", "/tiendanube"]) revalidatePath(path);
}

/** Vuelve la compra a "Por contactar" (por ejemplo para escribirle de nuevo). */
export async function unmarkWelcomed(saleId: string) {
  const db = await getDb();
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;
  s.welcomed = false;
  s.welcomedAt = undefined;
  if (s.welcomeBy === "auto") s.welcomeBy = undefined; // si la bienvenida salió sola, también vuelve a "Por contactar"
  await persist(db);
  for (const path of ["/ventas", "/mercadolibre", "/tiendanube"]) revalidatePath(path);
}

/** Marca que ya se le devolvió la plata al comprador de una venta caída (o lo desmarca). */
export async function setRefundDone(saleId: string, done: boolean) {
  const db = await getDb();
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;
  s.refundDoneAt = done ? today() : undefined;
  await persist(db);
  for (const path of ["/ventas", "/mercadolibre", "/tiendanube"]) revalidatePath(path);
}

/** Saca una compra de la lista "Esperando datos" (no borra la venta ni el contacto). */
export async function hideWaiting(saleId: string) {
  const db = await getDb();
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;
  s.waitingHidden = true;
  await persist(db);
  for (const path of ["/ventas", "/mercadolibre", "/tiendanube"]) revalidatePath(path);
}

/** Unifica dos escrituras de la misma categoría ("Logistica" y "Logística"): todo lo cargado con la primera pasa a la segunda. */
export async function unifyCategory(from: string, to: string) {
  const db = await getDb();
  if (!from.trim() || !to.trim() || from === to) return;
  for (const e of db.expenses) if (e.category === from) e.category = to;
  for (const p of db.products) if (p.category === from) p.category = to;
  for (const s of db.suppliers) if (s.category === from) s.category = to;
  const cats = db.settings.expenseCategories;
  db.settings.expenseCategories = [...new Set(cats.map((c) => (c === from ? to : c)))];
  await persist(db);
  for (const path of ["/reportes", "/gastos", "/productos", "/proveedores"]) revalidatePath(path);
}

/** Carga en el cliente los datos que se detectaron en un mensaje (o que se pegaron): lo que viene escrito pisa lo anterior y lo vacío no borra nada. */
export async function applyDetectedData(customerId: string, fd: FormData): Promise<void | { error: string }> {
  const db = await getDb();
  const c = db.customers.find((x) => x.id === customerId);
  if (!c) return { error: "No se encontró el cliente." };
  const phone = str(fd, "phone"), address = str(fd, "address"), city = str(fd, "city"), zip = str(fd, "zip"), doc = str(fd, "doc"), name = str(fd, "name");
  if (!phone && !address && !city && !doc && !name) return { error: "No hay datos para cargar." };
  if (name && name !== c.name) {
    if (!c.nickname && looksLikeUser(c)) c.nickname = c.name; // el usuario de ML se guarda una sola vez
    c.name = name;
  }
  if (phone) c.phone = phone;
  if (address) c.address = zip && !/\bCP\b/i.test(address) ? `${address} (CP ${zip})` : address;
  if (city) c.city = city;
  if (doc) c.doc = doc.replace(/\D/g, "");
  c.agendaOff = false; // con teléfono, la Agenda vuelve a decidir sola
  syncShipmentsFromCustomer(db, c);
  await persist(db);
  for (const path of ["/clientes", "/ventas", "/envios", "/mensajes", "/etiquetas", "/mercadolibre", "/tiendanube"]) revalidatePath(path);
}

/** Igual que applyDetectedData, para un botón de formulario (no devuelve nada). */
export async function applyDetected(customerId: string, fd: FormData): Promise<void> {
  const r = await applyDetectedData(customerId, fd);
  if (r && "error" in r) throw new Error(r.error);
}
