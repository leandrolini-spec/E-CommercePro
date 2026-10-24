import { forget } from "@/lib/memo";
import { inAgenda } from "@/modules/customers";
import { isProductos, welcomeParts } from "@/modules/welcome";
import { mlStageId } from "@/modules/shipments";
import { sendPhoneAlert } from "@/modules/alerts";
import { doneKey, isCourtesy, mlQuestionKey } from "@/modules/message-reads";
import { service } from "@/modules/repo/supabase";
import { mlGet, mlPost, MlError } from "./client";
import { getAccessToken } from "./oauth";
import { conversationIdOf } from "./data";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

/** Guarda en bloque lo que informa Mercado Libre, crudo y sin duplicar (clave project+kind+ml_id). */
export async function saveResources(projectId: string, kind: string, entries: [string, unknown][]) {
  const at = new Date().toISOString();
  forget(`ml:${projectId}`);
  for (const part of chunk(entries, 200)) {
    const { error } = await service().from("ml_resources").upsert(part.map(([ml_id, data]) => ({ project_id: projectId, kind, ml_id, data, fetched_at: at })));
    if (error) throw new Error(`No se pudo guardar ${kind}: ${error.message}`);
  }
}
export const saveResource = (projectId: string, kind: string, mlId: string, data: unknown) => saveResources(projectId, kind, [[mlId, data]]);

/* ---------- Órdenes → ventas y compradores del CRM (en bloque) ---------- */

export async function processOrders(projectId: string, orders: R[]) {
  if (!orders.length) return { created: 0 };
  const sb = service();
  await saveResources(projectId, "order", orders.map((o) => [String(o.id), o]));

  // Productos: se vinculan por nombre; los desconocidos se crean sin costo para completar después.
  const { data: prods } = await sb.from("products").select("id,name").eq("project_id", projectId);
  const byName = new Map((prods ?? []).map((p) => [norm(p.name), p.id as string]));
  // Vínculos manuales publicación → producto interno: tienen prioridad sobre el nombre.
  const { data: links } = await sb.from("ml_item_links").select("ml_item_id,product_id").eq("project_id", projectId);
  const linkMap = new Map((links ?? []).map((l) => [l.ml_item_id as string, l.product_id as string]));
  const productOf = (it: R) => linkMap.get(String(it.item.id)) ?? byName.get(norm(it.item.title));
  const fresh = new Map<string, R>();
  for (const o of orders) for (const it of (o.order_items ?? []) as R[]) {
    const key = norm(it.item.title);
    if (productOf(it)) continue;
    const id = `mli_${it.item.id}`;
    fresh.set(id, { id, project_id: projectId, sku: it.item.id, name: it.item.title, category: "", brand: "", unit: "unidad", cost: 0, price: Number(it.unit_price), track_stock: false });
    byName.set(key, id);
  }
  if (fresh.size) await sb.from("products").upsert([...fresh.values()], { ignoreDuplicates: true });

  // Compradores: nombre, teléfono y email solo si Mercado Libre los informa (no se inventa nada).
  const buyers = new Map<string, R>();
  for (const o of orders) if (o.buyer?.id) buyers.set(String(o.buyer.id), o.buyer);
  const ids = [...buyers.keys()].map((b) => `mlb_${b}`);
  const { data: have } = await sb.from("customers").select("*").eq("project_id", projectId).in("id", ids);
  const haveMap = new Map((have ?? []).map((c) => [c.id as string, c]));
  const customerRows = [...buyers].map(([bid, b]) => {
    const old = haveMap.get(`mlb_${bid}`) ?? {};
    const full = [b.first_name, b.last_name].filter(Boolean).join(" ");
    const phone = b.phone?.number ? `${b.phone.area_code ?? ""} ${b.phone.number}`.trim() : "";
    return {
      id: `mlb_${bid}`, project_id: projectId, origin: "Mercado Libre",
      // Si ya se cargó el nombre real (hay apodo guardado), la sincronización no lo pisa con el usuario.
      name: old.nickname ? old.name : (full || b.nickname || old.name || `Comprador ${bid}`), company: old.company ?? "", phone: phone || old.phone || "",
      email: b.email || old.email || "", city: old.city ?? "",
      is_full: inAgenda({ name: old.nickname ? old.name : (full || b.nickname || old.name), phone: phone || old.phone, address: old.address, agendaOff: old.agenda_off }),
    };
  });
  // Los compradores ya convertidos en clientes con datos completos no se pisan con lo que informa Mercado Libre.
  const toSave = customerRows.filter((c) => !haveMap.get(c.id)?.is_full);
  if (toSave.length) await sb.from("customers").upsert(toSave);
  // Ciudad y provincia del comprador: dato público del perfil (Mercado Libre no entrega nombre, teléfono ni email).
  await enqueueMany(projectId, "buyers", customerRows.filter((c) => !c.city).map((c) => `/users/${c.id.replace("mlb_", "")}`));

  // Ventas: las que ya existen solo se corrigen ante un reembolso o cancelación.
  const orderIds = orders.map((o) => String(o.id));
  const { data: existing } = await sb.from("sales").select("id,status,ml_order_id").eq("project_id", projectId).in("ml_order_id", orderIds);
  const exMap = new Map((existing ?? []).map((s) => [s.ml_order_id as string, s]));
  const { data: maxRow } = await sb.from("sales").select("number").eq("project_id", projectId).order("number", { ascending: false }).limit(1);
  let number = maxRow?.[0]?.number ?? 1000;
  const news: R[] = [];
  for (const o of [...orders].sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)))) {
    const refunded = (o.payments ?? []).some((p: R) => ["refunded", "charged_back"].includes(p.status)) || o.status === "cancelled";
    const ex = exMap.get(String(o.id));
    if (ex) {
      if (refunded && ex.status !== "cancelada") {
        await sb.from("sales").update({ status: "cancelada", pay_status: "reembolsada", refunded_at: new Date().toISOString().slice(0, 10) }).eq("id", ex.id);
        // Cancelada en todo sentido: el stock que se había descontado por esta venta vuelve.
        await sb.from("stock_movements").delete().eq("project_id", projectId).eq("ref", `ML-${o.id}`);
      }
      continue;
    }
    // Neto estimado: total menos comisión de venta (se confirma contra lo cobrado).
    const fee = ((o.order_items ?? []) as R[]).reduce((s, it) => s + Number(it.sale_fee ?? 0) * Number(it.quantity), 0);
    news.push({
      id: `ml_${o.id}`, project_id: projectId, number: ++number, customer_id: o.buyer?.id ? `mlb_${o.buyer.id}` : null,
      date: String(o.date_created).slice(0, 10), channel: "Mercado Libre", status: refunded ? "cancelada" : (o.tags ?? []).includes("delivered") || Date.now() - new Date(o.date_created).getTime() > 10 * 86400000 ? "entregado" : "pendiente",
      pay_method: "Mercado Pago", extra_costs: 0, net_amount: refunded ? 0 : Number(o.total_amount) - fee, pay_status: refunded ? "reembolsada" : "cobrada", refunded_at: refunded ? new Date().toISOString().slice(0, 10) : null, ml_order_id: String(o.id),
      items: ((o.order_items ?? []) as R[]).map((it) => ({ productId: productOf(it), qty: Number(it.quantity), unitPrice: Number(it.unit_price), discountPct: 0 })),
    });
  }
  for (const part of chunk(news, 100)) {
    const { error } = await sb.from("sales").insert(part);
    if (error) throw new Error(`No se pudieron guardar ventas: ${error.message}`);
  }
  await deductStock(projectId, news.filter((n) => n.status !== "cancelada"));
  await createShipmentsForSales(projectId, news.filter((n) => n.status !== "cancelada"), orders);
  await markArrived(projectId, orders);
  await closeDelivered(projectId).catch(() => {});
  await settleRefunds(projectId).catch(() => {});
  await autoWelcome(projectId);
  forget("db:");
  return { created: news.length };
}

/** Manda los tres mensajes de bienvenida en orden. Si falla el primero se avisa (no salió nada); si falla uno de los siguientes se corta ahí. */
export async function sendWelcomeMessages(projectId: string, pack: string, seller: string, buyer: string, company?: Parameters<typeof welcomeParts>[0]) {
  const parts = welcomeParts(company);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200));
    try { await mlPost(projectId, `/messages/packs/${pack}/sellers/${seller}`, { from: { user_id: seller }, to: { user_id: buyer }, text: parts[i] }, { tag: "post_sale" }); }
    catch (e) { if (i === 0) throw e; break; }
  }
}

/**
 * Bienvenida automática (si está activada): a cada compra de productos de las últimas 24 h que todavía no recibió la bienvenida le escribe sola
 * por Mercado Libre pidiendo el teléfono. Texto fijo, una sola vez por compra. Si falla, la compra queda sin marca de enviado para hacerlo a mano.
 * Se corre con cada sincronización de órdenes y también en el momento de activar el interruptor (así alcanza a las que entraron antes).
 */
export async function autoWelcome(projectId: string) {
  const sb = service();
  const { data: st } = await sb.from("project_settings").select("company").eq("project_id", projectId).single();
  if ((st?.company as R | null)?.welcomeAuto !== true) return { sent: 0 };
  const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const { data: sales } = await sb.from("sales").select("id,ml_order_id,customer_id,items").eq("project_id", projectId).eq("channel", "Mercado Libre")
    .neq("status", "cancelada").eq("welcomed", false).is("welcome_sent_at", null).gte("date", since);
  const { data: prods } = await sb.from("products").select("id,name,category").eq("project_id", projectId);
  const prod = new Map((prods ?? []).map((p) => [p.id as string, p as { name: string; category: string }]));
  const { data: acc } = await sb.from("ml_accounts").select("ml_user_id").eq("project_id", projectId).single();
  if (!acc) return { sent: 0 };
  const seller = String(acc.ml_user_id);
  let sent = 0;
  for (const s of sales ?? []) {
    if (!(s.items as { productId: string }[]).some((i) => isProductos(prod.get(i.productId)))) continue;
    const buyer = String(s.customer_id ?? "").replace(/^mlb_/, "");
    if (!buyer || !s.ml_order_id) continue;
    // Se reserva la compra ANTES de escribir: varias sincronizaciones pueden correr a la vez y, si todas la veían sin marcar, cada una mandaba la bienvenida completa (mensajes repetidos y mezclados).
    // La actualización es condicional: solo una gana; las demás la saltean.
    const { data: claimed } = await sb.from("sales").update({ welcome_sent_at: today, welcome_by: "auto" }).eq("id", s.id).is("welcome_sent_at", null).select("id");
    if (!claimed?.length) continue;
    try {
      const pack = await conversationIdOf(projectId, String(s.ml_order_id));
      await sendWelcomeMessages(projectId, pack, seller, buyer, st?.company as Parameters<typeof welcomeParts>[0]);
      sent++;
    } catch {
      // No salió ni el primero (ML no lo aceptó o no hubo conexión): se libera para hacerlo a mano o en la próxima sincronización.
      await sb.from("sales").update({ welcome_sent_at: null, welcome_by: null }).eq("id", s.id);
    }
  }
  // La conversación guardada se actualiza para que el mensaje enviado figure en el historial del cliente (de las últimas 24 h, también las ya enviadas).
  const { data: recent } = await sb.from("sales").select("ml_order_id").eq("project_id", projectId).eq("channel", "Mercado Libre").gte("welcome_sent_at", since).not("ml_order_id", "is", null).limit(15);
  for (const r of recent ?? []) await processJob(projectId, "conversation", await conversationIdOf(projectId, String(r.ml_order_id))).catch(() => {});
  if (sent) forget("db:");
  return { sent };
}

/**
 * Cierra solo lo que ya llegó a destino: compras que Mercado Libre marca como entregadas o que el comprador calificó / confirmó que recibió.
 * La venta pasa a "entregado", su tarjeta sale de Nuevos compradores (Por contactar y Esperando datos) y el envío pasa a "Entregado".
 */
export async function closeDelivered(projectId: string) {
  const sb = service();
  // Compras de hace 3 días o más que nunca tuvieron un envío en el seguimiento: con reparto martes y viernes ya llegaron (las que tienen envío siguen su etapa).
  const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const { data: old } = await sb.from("sales").select("id").eq("project_id", projectId).eq("status", "pendiente").lte("date", cutoff).neq("pay_status", "reclamo").limit(500);
  if (old?.length) {
    const { data: withShip } = await sb.from("shipments").select("sale_id").eq("project_id", projectId).in("sale_id", old.map((o) => o.id));
    const has = new Set((withShip ?? []).map((x) => x.sale_id));
    const ids = old.map((o) => o.id).filter((id) => !has.has(id));
    for (const part of chunk(ids, 100)) await sb.from("sales").update({ status: "entregado", welcomed: true, waiting_hidden: true }).eq("project_id", projectId).in("id", part);
  }
  const { data } = await sb.from("ml_resources").select("ml_id,tags:data->tags,fb:data->feedback,st:data->>status").eq("project_id", projectId).eq("kind", "order").limit(5000);
  const arrived = (data ?? [])
    .filter((o) => o.st !== "cancelled" && ((Array.isArray(o.tags) && o.tags.includes("delivered")) || (o.fb as R | null)?.sale?.fulfilled === true || !!(o.fb as R | null)?.sale?.rating))
    .map((o) => String(o.ml_id));
  // También los envíos que Mercado Libre ya dio por entregados.
  const { data: ships } = await sb.from("shipments").select("order_ref").eq("project_id", projectId).eq("channel", "Mercado Libre").eq("ml_status", "delivered");
  for (const x of ships ?? []) if (x.order_ref && !arrived.includes(String(x.order_ref))) arrived.push(String(x.order_ref));
  if (!arrived.length) return { closed: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const { data: st } = await sb.from("project_settings").select("shipment_stages").eq("project_id", projectId).single();
  const canShip = ((st?.shipment_stages ?? []) as { id: string }[]).some((x) => x.id === "entregado");
  let closed = 0;
  for (const part of chunk(arrived, 100)) {
    const { data: upd } = await sb.from("sales").update({ status: "entregado", welcomed: true, waiting_hidden: true }).eq("project_id", projectId).in("ml_order_id", part).in("status", ["pendiente", "preparando", "enviado"]).select("id");
    closed += upd?.length ?? 0;
    // Las tarjetas ya contactadas conservan su fecha de bienvenida; las que nunca se contactaron salen igual.
    await sb.from("sales").update({ waiting_hidden: true }).eq("project_id", projectId).in("ml_order_id", part).eq("status", "entregado").eq("waiting_hidden", false);
    await sb.from("sales").update({ welcomed: true }).eq("project_id", projectId).in("ml_order_id", part).eq("status", "entregado").eq("welcomed", false);
    if (canShip) await sb.from("shipments").update({ stage: "entregado", delivered_at: today }).eq("project_id", projectId).eq("channel", "Mercado Libre").in("order_ref", part).not("stage", "in", "(entregado,volvio)");
  }
  if (closed) forget("db:");
  return { closed };
}

/**
 * Estado de los reclamos de las órdenes con mediación: se consulta a Mercado Libre y se guarda ("opened" o "closed").
 * Los ya cerrados no se vuelven a consultar.
 */
export async function syncClaims(projectId: string) {
  const sb = service();
  const { data: orders } = await sb.from("ml_resources").select("ml_id,mediations:data->mediations").eq("project_id", projectId).eq("kind", "order").limit(5000);
  const ids = [...new Set((orders ?? []).flatMap((o) => (Array.isArray(o.mediations) ? (o.mediations as { id: number | string }[]).map((m) => String(m.id)) : [])))];
  if (!ids.length) return { checked: 0 };
  const { data: known } = await sb.from("ml_resources").select("ml_id,status:data->>status").eq("project_id", projectId).eq("kind", "claim").in("ml_id", ids);
  const closed = new Set((known ?? []).filter((k) => k.status === "closed").map((k) => String(k.ml_id)));
  let checked = 0;
  for (const id of ids.filter((i) => !closed.has(i)).slice(0, 40)) {
    try {
      let c: R;
      try { c = await mlGet<R>(projectId, `/post-purchase/v1/claims/${id}`); } catch { c = await mlGet<R>(projectId, `/v1/claims/${id}`); }
      await saveResource(projectId, "claim", id, c);
      checked++;
    } catch { /* sin acceso a ese reclamo: queda "sin confirmar" */ }
  }
  return { checked };
}

/** Reembolsos que Mercado Libre ya resolvió (todos los pagos de la orden devueltos o anulados): salen solos de "Reembolsar". */
export async function settleRefunds(projectId: string) {
  const sb = service();
  const { data: pend } = await sb.from("sales").select("id,ml_order_id").eq("project_id", projectId).not("refunded_at", "is", null).is("refund_done_at", null).not("ml_order_id", "is", null).limit(200);
  if (!pend?.length) return { settled: 0 };
  const { data: orders } = await sb.from("ml_resources").select("ml_id,pays:data->payments").eq("project_id", projectId).eq("kind", "order").in("ml_id", pend.map((p) => String(p.ml_order_id)));
  const today = new Date().toISOString().slice(0, 10);
  let settled = 0;
  for (const o of orders ?? []) {
    const pays = (Array.isArray(o.pays) ? o.pays : []) as { status?: string }[];
    if (pays.length && pays.every((p) => ["refunded", "cancelled", "rejected"].includes(String(p.status)))) {
      await sb.from("sales").update({ refund_done_at: today }).eq("project_id", projectId).eq("ml_order_id", String(o.ml_id)).is("refund_done_at", null);
      settled++;
    }
  }
  if (settled) forget("db:");
  return { settled };
}

/** Actualiza las conversaciones de las compras de los últimos 10 días (también las respondidas desde la app de Mercado Libre). */
export async function refreshRecentConversations(projectId: string) {
  const since = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const { data } = await service().from("sales").select("ml_order_id").eq("project_id", projectId).eq("channel", "Mercado Libre").neq("status", "cancelada").gte("date", since).not("ml_order_id", "is", null).limit(60);
  const ids = [...new Set(await Promise.all((data ?? []).map((r) => conversationIdOf(projectId, String(r.ml_order_id)))))];
  for (const id of ids.slice(0, 40)) await processJob(projectId, "conversation", id).catch(() => {});
  forget("db:");
}

/**
 * Pedidos que llegaron a destino: Mercado Libre marca la orden como entregada, o el comprador confirma que la recibió / la califica.
 * Cualquiera de las dos señales pasa el envío a "Entregado" (y aparece el aviso en la campanita).
 */
async function markArrived(projectId: string, orders: R[]) {
  const arrived = orders
    .filter((o) => o.status !== "cancelled" && ((o.tags ?? []).includes("delivered") || o.feedback?.sale?.fulfilled === true || !!o.feedback?.sale?.rating))
    .map((o) => String(o.id));
  if (!arrived.length) return;
  const sb = service();
  const { data: st } = await sb.from("project_settings").select("shipment_stages").eq("project_id", projectId).single();
  const stages = ((st?.shipment_stages ?? []) as { id: string }[]).map((x) => x.id);
  if (!stages.includes("entregado")) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const part of chunk(arrived, 100))
    await sb.from("shipments").update({ stage: "entregado", delivered_at: today }).eq("project_id", projectId).eq("channel", "Mercado Libre").in("order_ref", part).not("stage", "in", "(entregado,volvio)");
}

/**
 * Descuenta el stock de las ventas nuevas (un kit descuenta cada componente). Solo se descuentan productos que ya tienen
 * stock cargado o son kits: así el historial anterior a llevar el stock no deja números negativos.
 */
async function deductStock(projectId: string, sales: R[]) {
  if (!sales.length) return;
  const sb = service();
  const [{ data: prods }, { data: ins }] = await Promise.all([
    sb.from("products").select("id,track_stock,components").eq("project_id", projectId),
    sb.from("stock_movements").select("product_id").eq("project_id", projectId).eq("type", "ingreso"),
  ]);
  const byId = new Map((prods ?? []).map((p) => [p.id as string, p as { id: string; track_stock: boolean; components: { productId: string; qty: number }[] }]));
  const withStock = new Set((ins ?? []).map((m) => m.product_id as string));
  const impact = (id: string, qty: number, depth = 0): { id: string; qty: number }[] => {
    const p = byId.get(id);
    if (!p) return [];
    if (p.components?.length && depth < 4) return p.components.flatMap((c) => impact(c.productId, qty * c.qty, depth + 1));
    return p.track_stock !== false && withStock.has(id) ? [{ id, qty }] : [];
  };
  const rows: R[] = [];
  for (const sale of sales)
    (sale.items as { productId: string; qty: number }[]).forEach((it, i) =>
      impact(it.productId, it.qty).forEach((m, j) =>
        rows.push({ id: `mlm_${sale.ml_order_id}_${i}_${j}`, project_id: projectId, product_id: m.id, type: "egreso", qty: -m.qty, date: sale.date, reason: "Venta Mercado Libre", ref: `ML-${sale.ml_order_id}` })));
  for (const part of chunk(rows, 100)) {
    const { error } = await sb.from("stock_movements").upsert(part, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`No se pudo descontar el stock: ${error.message}`);
  }
}

/* ---------- Procesamiento de un trabajo ---------- */

// Códigos ISO 3166-2:AR que usa Mercado Libre.
const PROVINCES: Record<string, string> = { A: "Salta", B: "Buenos Aires", C: "CABA", D: "San Luis", E: "Entre Ríos", F: "La Rioja", G: "Santiago del Estero", H: "Chaco", J: "San Juan", K: "Catamarca", L: "La Pampa", M: "Mendoza", N: "Misiones", P: "Formosa", Q: "Neuquén", R: "Río Negro", S: "Santa Fe", T: "Tucumán", U: "Chubut", V: "Tierra del Fuego", W: "Corrientes", X: "Córdoba", Y: "Jujuy", Z: "Santa Cruz" };

const idOf = (resource: string) => resource.split("/").filter(Boolean).pop() ?? resource;

/** Cada compra nueva entra sola al seguimiento, en la primera etapa (Compra). Los datos de entrega llegan después con el envío de ML. */
async function createShipmentsForSales(projectId: string, sales: R[], orders: R[]) {
  if (!sales.length) return;
  const sb = service();
  const [{ data: st }, { data: prods }] = await Promise.all([
    sb.from("project_settings").select("shipment_stages").eq("project_id", projectId).single(),
    sb.from("products").select("id,name").eq("project_id", projectId),
  ]);
  const stageIds = ((st?.shipment_stages ?? []) as { id: string }[]).map((x) => x.id);
  const first = stageIds[0] ?? "compra";
  const names = new Map((prods ?? []).map((p) => [p.id as string, p.name as string]));
  const shipOf = new Map(orders.map((o) => [String(o.id), o.shipping?.id ? String(o.shipping.id) : ""]));
  const rows = sales.map((s) => {
    const shipId = shipOf.get(String(s.ml_order_id)) ?? "";
    return {
      id: shipId ? `ml_${shipId}` : `ml_o_${s.ml_order_id}`, project_id: projectId, sale_id: s.id, order_ref: String(s.ml_order_id), channel: "Mercado Libre", customer: "",
      items: (s.items as { productId: string; qty: number }[]).map((i) => `${i.qty} × ${names.get(i.productId) ?? "Producto"}`).join(" · "),
      // Una compra vieja que ya figura entregada no entra al tablero como "Compra" nueva.
      stage: s.status === "entregado" && stageIds.includes("entregado") ? "entregado" : first, created_at: s.date, ml_shipment_id: shipId || null,
      ...(s.status === "entregado" ? { delivered_at: s.date } : {}),
    };
  });
  for (let i = 0; i < rows.length; i += 100) await sb.from("shipments").upsert(rows.slice(i, i + 100), { onConflict: "id", ignoreDuplicates: true });
}

/**
 * Cada publicación de Mercado Libre tiene su producto en el CRM: si una publicación nueva no está vinculada a ninguno, se crea el
 * producto (con el título y el precio de ML, sin costo) y se vincula sola. Después solo falta cargarle el costo.
 */
async function ensureItemProducts(projectId: string, items: R[]) {
  const live = items.filter((i) => i?.id && i.status !== "closed");
  if (!live.length) return;
  const sb = service();
  const { data: links } = await sb.from("ml_item_links").select("ml_item_id").eq("project_id", projectId).in("ml_item_id", live.map((i) => String(i.id)));
  const linked = new Set((links ?? []).map((l) => String(l.ml_item_id)));
  const fresh = live.filter((i) => !linked.has(String(i.id)));
  if (!fresh.length) return;
  await sb.from("products").upsert(
    fresh.map((i) => ({
      id: `mli_${i.id}`, project_id: projectId, sku: String(i.id), name: String(i.title ?? i.id),
      category: "", unit: "unidad", cost: 0, price: Number(i.price ?? 0), track_stock: false, kind: "venta",
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  await sb.from("ml_item_links").upsert(fresh.map((i) => ({ project_id: projectId, ml_item_id: String(i.id), product_id: `mli_${i.id}` })), { onConflict: "project_id,ml_item_id", ignoreDuplicates: true });
  forget("db:");
}

/**
 * Pasa un envío de Mercado Libre al seguimiento de Envíos. Un envío nuevo entra en la etapa que le corresponde por su estado.
 * Después, la etapa solo se mueve sola cuando Mercado Libre informa un estado distinto (lo que muevas a mano se respeta).
 */
async function upsertShipment(projectId: string, s: R) {
  const sb = service();
  const id = `ml_${s.id}`;
  const orderId = String(s.order_id ?? "");
  const a = (s.receiver_address ?? {}) as R;
  const status = String(s.status ?? ""), sub = String(s.substatus ?? "");
  const { data: st } = await sb.from("project_settings").select("shipment_stages").eq("project_id", projectId).single();
  const stages = ((st?.shipment_stages ?? []) as { id: string }[]).map((x) => x.id);
  const mapped = mlStageId(status, sub);
  const stage = stages.includes(mapped) ? mapped : (stages[0] ?? mapped);
  const { data: sale } = await sb.from("sales").select("id,items").eq("project_id", projectId).eq("ml_order_id", orderId).maybeSingle();
  let items = "";
  if (sale) {
    const ids = (sale.items as { productId: string; qty: number }[]).map((i) => i.productId);
    const { data: prods } = await sb.from("products").select("id,name").eq("project_id", projectId).in("id", ids);
    const names = new Map((prods ?? []).map((p) => [p.id as string, p.name as string]));
    items = (sale.items as { productId: string; qty: number }[]).map((i) => `${i.qty} × ${names.get(i.productId) ?? "Producto"}`).join(" · ");
  }
  const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
  const address = [a.address_line, a.comment].filter(Boolean).join(" · ");
  const city = [a.city?.name, a.state?.name].filter(Boolean).join(", ");
  const { data: ex } = await sb.from("shipments").select("*").eq("id", id).maybeSingle();
  if (!ex) {
    await sb.from("shipments").insert({
      id, project_id: projectId, sale_id: sale?.id ?? (orderId ? `ml_${orderId}` : null), order_ref: orderId, channel: "Mercado Libre", customer: String(a.receiver_name ?? ""),
      phone: String(a.receiver_phone ?? ""), address, city, zip: String(a.zip_code ?? ""), items, tracking: String(s.tracking_number ?? ""), stage,
      dispatched_at: day(s.status_history?.date_shipped), delivered_at: day(s.status_history?.date_delivered), created_at: day(s.date_created) ?? undefined, ml_status: status, ml_shipment_id: String(s.id),
    });
    return;
  }
  const patch: R = { ml_status: status, dispatched_at: ex.dispatched_at ?? day(s.status_history?.date_shipped), delivered_at: ex.delivered_at ?? day(s.status_history?.date_delivered) };
  if (ex.ml_status !== status && stages.includes(mapped)) patch.stage = mapped;
  if (!ex.address && address) patch.address = address;
  if (!ex.city && city) patch.city = city;
  if (!ex.customer && a.receiver_name) patch.customer = String(a.receiver_name);
  if (!ex.phone && a.receiver_phone) patch.phone = String(a.receiver_phone);
  if (!ex.items && items) patch.items = items;
  if (!ex.tracking && s.tracking_number) patch.tracking = String(s.tracking_number);
  await sb.from("shipments").update(patch).eq("id", id);
}

/** Pone en la cola los envíos de las órdenes que todavía no se trajeron (para completar el seguimiento con el historial). */
export async function queueMissingShipments(projectId: string) {
  const sb = service();
  const [{ data: orders }, { data: have }] = await Promise.all([
    sb.from("ml_resources").select("data").eq("project_id", projectId).eq("kind", "order").limit(5000),
    sb.from("shipments").select("ml_shipment_id").eq("project_id", projectId).not("ml_shipment_id", "is", null).limit(5000),
  ]);
  const got = new Set((have ?? []).map((x) => String(x.ml_shipment_id)));
  const missing = [...new Set((orders ?? []).map((o) => (o.data as R)?.shipping?.id).filter(Boolean).map(String))].filter((id) => !got.has(id));
  if (missing.length) await enqueueMany(projectId, "shipments", missing.map((id) => `/shipments/${id}`));
  return missing.length;
}

/** Órdenes sin envío de Mercado Libre: la dirección solo puede venir de los datos de facturación del comprador. Se piden una vez por orden. */
export async function queueMissingBilling(projectId: string) {
  const sb = service();
  const [{ data: orders }, { data: have }] = await Promise.all([
    sb.from("ml_resources").select("ml_id,data").eq("project_id", projectId).eq("kind", "order").limit(5000),
    sb.from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "billing").limit(5000),
  ]);
  const got = new Set((have ?? []).map((x) => String(x.ml_id)));
  const missing = (orders ?? []).filter((o) => !(o.data as R)?.shipping?.id && !got.has(String(o.ml_id))).map((o) => String(o.ml_id));
  if (missing.length) await enqueueMany(projectId, "billing", missing.map((id) => `/billing/${id}`));
  return missing.length;
}

const digitsOnly = (t: string) => t.replace(/\D/g, "");

/** Domicilio de facturación: la API lo entrega como lista de pares {type, value} (CITY_NAME, STREET_NAME…) o, en otras cuentas, como un objeto address. */
function billingPlace(b: R): { address: string; city: string; doc: string } {
  const info = (b?.billing_info ?? b?.buyer?.billing_info ?? {}) as R;
  const kv = new Map<string, string>();
  for (const x of (info.additional_info ?? []) as R[]) if (x?.type && x?.value != null) kv.set(String(x.type), String(x.value).trim());
  const a = (info.address ?? b?.address ?? {}) as R;
  const street = [kv.get("STREET_NAME") ?? a.street_name, kv.get("STREET_NUMBER") ?? a.street_number].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  // El DNI del comprador (solo si el documento es un DNI): sirve para las etiquetas de Vía Cargo, Andreani y Correo.
  const rawDoc = String(info.doc_type ?? "").toUpperCase() === "DNI" ? digitsOnly(String(info.doc_number ?? "")) : "";
  const doc = rawDoc.length >= 7 && rawDoc.length <= 8 ? rawDoc : "";
  if (!street) return { address: "", city: "", doc };
  const zip = kv.get("ZIP_CODE") ?? a.zip_code;
  const extra = [kv.get("NEIGHBORHOOD") ?? a.neighborhood?.name, kv.get("COMMENT") ?? a.comment].filter(Boolean).join(" · ");
  const city = [kv.get("CITY_NAME") ?? a.city_name ?? a.city?.name, kv.get("STATE_NAME") ?? a.state?.name].filter(Boolean).join(", ");
  return { address: [street, extra].filter(Boolean).join(" · ") + (zip ? ` (CP ${zip})` : ""), city, doc };
}

/** Completa al comprador con el domicilio de facturación, solo en lo que le falte (dirección vacía; localidad vacía o "Sin dato"). */
async function fillFromBilling(projectId: string, buyerId: string, place: { address: string; city: string; doc: string }) {
  if (!place.address && !place.doc) return;
  const sb = service();
  const { data: c } = await sb.from("customers").select("*").eq("project_id", projectId).eq("id", `mlb_${buyerId}`).maybeSingle();
  if (!c) return;
  const patch: R = {};
  if (!c.address && place.address) patch.address = place.address;
  if (!c.doc && place.doc) patch.doc = place.doc;
  if (place.city && (!c.city || c.city === "Sin dato")) patch.city = place.city;
  if (!Object.keys(patch).length) return;
  const next = { ...c, ...patch };
  patch.is_full = inAgenda({ name: next.name, phone: next.phone, address: next.address, agendaOff: next.agenda_off });
  await sb.from("customers").update(patch).eq("project_id", projectId).eq("id", `mlb_${buyerId}`);
}

async function processBilling(projectId: string, orderId: string) {
  const sb = service();
  let b: R;
  try { b = await mlGet<R>(projectId, `/orders/${orderId}/billing_info`); }
  catch (e) { await saveResource(projectId, "billing", orderId, { error: (e as Error).message }); return; } // sin permiso o sin datos: no se vuelve a pedir
  await saveResource(projectId, "billing", orderId, b);
  const { data: o } = await sb.from("ml_resources").select("buyer:data->buyer").eq("project_id", projectId).eq("kind", "order").eq("ml_id", orderId).maybeSingle();
  const buyer = (o as { buyer?: R } | null)?.buyer?.id;
  if (buyer) await fillFromBilling(projectId, String(buyer), billingPlace(b));
}

/** Aplica los datos de facturación ya guardados (sin volver a pedirlos a Mercado Libre) a los compradores que todavía no tienen dirección. */
export async function applyStoredBilling(projectId: string) {
  const sb = service();
  const [{ data: bills }, { data: orders }, { data: custs }] = await Promise.all([
    sb.from("ml_resources").select("ml_id,data").eq("project_id", projectId).eq("kind", "billing").limit(5000),
    sb.from("ml_resources").select("ml_id,buyer:data->buyer").eq("project_id", projectId).eq("kind", "order").limit(5000),
    sb.from("customers").select("id,address,city,doc").eq("project_id", projectId).like("id", "mlb_%").limit(5000),
  ]);
  const buyerOf = new Map((orders ?? []).map((o) => [String(o.ml_id), (o as unknown as { buyer?: R }).buyer?.id]));
  // Solo los que de verdad les falta algo: así la corrida es liviana aunque haya cientos de compradores.
  const needs = new Set((custs ?? []).filter((c) => !c.address || !c.city || c.city === "Sin dato" || !c.doc).map((c) => String(c.id)));
  let n = 0;
  for (const bl of bills ?? []) {
    const buyer = buyerOf.get(String(bl.ml_id));
    if (!buyer || !needs.has(`mlb_${buyer}`)) continue;
    const place = billingPlace(bl.data as R);
    if (place.address || place.doc) { await fillFromBilling(projectId, String(buyer), place); n++; }
  }
  return n;
}

async function processShipment(projectId: string, id: string) {
  const s = await mlGet<R>(projectId, `/shipments/${id}`);
  await saveResource(projectId, "shipment", id, s);
  await upsertShipment(projectId, s).catch(() => {});
  const city = s.receiver_address?.city?.name, state = s.receiver_address?.state?.name;
  const rid = s.receiver_id ?? s.receiver_address?.receiver_id;
  if (!rid) return;
  // Con el envío de Mercado Libre llegan nombre, teléfono y domicilio reales: se completan solos los que falten y, si ya están los tres, el contacto pasa a la Agenda.
  const sb = service();
  const { data: c } = await sb.from("customers").select("*").eq("project_id", projectId).eq("id", `mlb_${rid}`).maybeSingle();
  if (!c) return;
  const a = (s.receiver_address ?? {}) as R;
  const real = String(a.receiver_name ?? "").trim();
  const address = [a.address_line, a.comment].filter(Boolean).join(" · ") + (a.zip_code ? ` (CP ${a.zip_code})` : "");
  const patch: R = {};
  if (real && !c.nickname && c.name !== real && !/\s/.test(String(c.name).trim())) { patch.nickname = c.name; patch.name = real; } // el usuario de ML queda guardado aparte
  else if (real && !String(c.name).trim()) patch.name = real;
  if (!c.phone && a.receiver_phone) patch.phone = String(a.receiver_phone);
  if (!c.address && address.trim()) patch.address = address.trim();
  if (!c.city && city) patch.city = [city, state].filter(Boolean).join(", ");
  const next = { ...c, ...patch };
  patch.is_full = inAgenda({ name: next.name, phone: next.phone, address: next.address, agendaOff: next.agenda_off });
  await sb.from("customers").update(patch).eq("project_id", projectId).eq("id", `mlb_${rid}`);
}

export async function processJob(projectId: string, topic: string, resource: string) {
  const { mlUserId } = await getAccessToken(projectId);

  // Carga del historial por páginas: cada página es un trabajo corto que encola la siguiente.
  if (topic.startsWith("backfill_")) {
    const [offsetStr, since] = resource.split("|");
    const offset = Number(offsetStr) || 0;
    if (topic === "backfill_orders") {
      const limit = 50;
      const q: Record<string, string | number> = { seller: mlUserId, sort: "date_desc", limit, offset };
      if (since) q["order.date_created.from"] = `${since}T00:00:00.000-00:00`;
      const r = await mlGet<R>(projectId, "/orders/search", q);
      const orders = (r.results ?? []) as R[];
      // Las conversaciones se traen solo de órdenes que todavía no estaban guardadas (en una carga completa, de todas).
      const { data: known } = await service().from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "order").in("ml_id", orders.map((o) => String(o.id)));
      const knownIds = new Set((known ?? []).map((k) => k.ml_id as string));
      const fresh = since ? orders.filter((o) => !knownIds.has(String(o.id))) : orders;
      await processOrders(projectId, orders);
      for (const o of orders) if (o.shipping?.id) await enqueue(projectId, "shipments", `/shipments/${o.shipping.id}`);
      // Conversación de post-venta de cada orden (si no hay carrito, el "pack" es el id de la orden).
      await enqueueMany(projectId, "conversation", fresh.map((o) => String(o.pack_id ?? o.id)));
      if (offset + limit < Number(r.paging?.total ?? 0) && orders.length) await enqueue(projectId, topic, `${offset + limit}|${since ?? ""}`);
    } else if (topic === "backfill_questions") {
      const limit = 50;
      const incremental = since === "inc";
      const r = await mlGet<R>(projectId, "/questions/search", { seller_id: mlUserId, api_version: 4, limit, offset, sort_fields: "date_created", sort_types: "DESC" });
      const qs = (r.questions ?? []) as R[];
      const { data: known } = await service().from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "question").in("ml_id", qs.map((x) => String(x.id)));
      const knownIds = new Set((known ?? []).map((k) => k.ml_id as string));
      const unseen = qs.filter((x) => !knownIds.has(String(x.id))).length;
      await saveResources(projectId, "question", qs.map((x) => [String(x.id), x])); // se actualizan también las ya conocidas (p. ej. respondidas)
      // En modo incremental se corta apenas una página no trae nada nuevo: no se vuelve atrás por todo el historial.
      if (offset + limit < Number(r.total ?? 0) && qs.length && (!incremental || unseen > 0)) await enqueue(projectId, topic, `${offset + limit}|${since ?? ""}`);
    } else if (topic === "backfill_items") {
      const limit = 100;
      const r = await mlGet<R>(projectId, `/users/${mlUserId}/items/search`, { limit, offset });
      const ids = (r.results ?? []) as string[];
      for (const part of chunk(ids, 20)) {
        const multi = await mlGet<R[]>(projectId, "/items", { ids: part.join(",") });
        await saveResources(projectId, "item", multi.filter((m) => m.code === 200 && m.body).map((m) => [String(m.body.id), m.body]));
        await ensureItemProducts(projectId, multi.filter((m) => m.code === 200 && m.body).map((m) => m.body)).catch(() => {});
      }
      if (offset + limit < Number(r.paging?.total ?? 0) && ids.length) await enqueue(projectId, topic, String(offset + limit));
    }
    return;
  }

  // Solo rutas relativas de la API: un aviso nunca puede hacer que pidamos otra dirección.
  const path = resource.startsWith("/") ? resource : `/${topic === "messages" ? "messages/" : ""}${resource}`;
  if (path.includes("..") || path.includes("//") || path.includes(":")) throw new Error("Recurso no válido");
  const id = idOf(path);

  switch (topic) {
    case "orders_v2":
    case "orders": {
      const order = await mlGet<R>(projectId, `/orders/${id}`);
      await processOrders(projectId, [order]);
      if (order.shipping?.id) await enqueue(projectId, "shipments", `/shipments/${order.shipping.id}`);
      else await enqueue(projectId, "billing", `/billing/${order.id}`);
      return;
    }
    case "items": {
      const item = await mlGet<R>(projectId, `/items/${id}`);
      await saveResource(projectId, "item", id, item);
      await ensureItemProducts(projectId, [item]).catch(() => {});
      return;
    }
    case "questions": {
      const q = await mlGet<R>(projectId, `/questions/${id}`);
      const { data: had } = await service().from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "question").eq("ml_id", id).maybeSingle();
      await saveResource(projectId, "question", id, q);
      // Pregunta nueva sin responder (de las últimas 3 horas: no se avisa de lo viejo que entra al sincronizar): aviso al celular del negocio.
      if (!had && q.status === "UNANSWERED" && Date.now() - new Date(String(q.date_created)).getTime() < 3 * 3600_000) {
        const { data: it } = await service().from("ml_resources").select("title:data->>title").eq("project_id", projectId).eq("kind", "item").eq("ml_id", String(q.item_id)).maybeSingle();
        await sendPhoneAlert(projectId, { title: "Pregunta nueva en Mercado Libre", message: `${(it as { title?: string } | null)?.title ?? "Una publicación"}\nRespondela en Mensajes.` });
      }
      return;
    }
    case "shipments": return processShipment(projectId, id);
    case "billing": return processBilling(projectId, id);
    case "messages": {
      const msg = await mlGet<R>(projectId, `/messages/${id}`, { tag: "post_sale" });
      const { data: hadMsg } = await service().from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "message").eq("ml_id", id).maybeSingle();
      await saveResource(projectId, "message", id, msg);
      // Mensaje nuevo de un comprador (no de cortesía): aviso al celular del negocio.
      const m0 = (msg.messages?.[0] ?? msg) as R;
      const fromBuyer = String(m0.from?.user_id ?? "") !== String(mlUserId);
      if (!hadMsg && fromBuyer && !isCourtesy(String(m0.text ?? "")) && Date.now() - new Date(String(m0.message_date?.created ?? m0.message_date?.received ?? 0)).getTime() < 3 * 3600_000)
        await sendPhoneAlert(projectId, { title: "Mensaje nuevo de un comprador", message: "Un comprador te escribió por una compra. Respondelo en Mensajes." });
      // Llegó un mensaje (del comprador o escrito desde la app de Mercado Libre): se actualiza toda la charla de esa compra.
      const pack = ((msg.messages?.[0] ?? msg).message_resources ?? []).find((r: R) => r.name === "packs" || r.name === "orders")?.id;
      if (pack) await processJob(projectId, "conversation", String(pack)).catch(() => {});
      return;
    }
    case "conversation": {
      try {
        const c = await mlGet<R>(projectId, `/messages/packs/${id}/sellers/${mlUserId}`, { tag: "post_sale", limit: 50 });
        await saveResource(projectId, "conversation", id, c);
      } catch (e) {
        if (!(e instanceof MlError && e.status === 404)) throw e; // sin conversación para esa orden
      }
      return;
    }
    case "buyers": {
      let u: R;
      try {
        u = await mlGet<R>(projectId, `/users/${id}`);
      } catch (e) {
        // Perfil no disponible: se marca para no reintentar eternamente.
        if (e instanceof MlError && [403, 404].includes(e.status)) {
          await service().from("customers").update({ city: "Sin dato" }).eq("project_id", projectId).eq("id", `mlb_${id}`);
          return;
        }
        throw e;
      }
      await saveResource(projectId, "buyer", id, u);
      const city = u.address?.city, state = PROVINCES[String(u.address?.state ?? "").replace("AR-", "")] ?? u.address?.state;
      await service().from("customers").update({ city: [city, state].filter(Boolean).join(", ") || "Sin dato" }).eq("project_id", projectId).eq("id", `mlb_${id}`);
      return;
    }
    default:
      // Resto de los tópicos (pagos, reclamos, mensajes, promociones, precios…): se guarda lo que informa la API, tal cual.
      return saveResource(projectId, topic, id, await mlGet(projectId, path));
  }
}

/* ---------- Cola ---------- */

export async function enqueue(projectId: string, topic: string, resource: string, source?: string) {
  const { error } = await service().from("sync_jobs").insert({ project_id: projectId, topic, resource, ...(source ? { source } : {}) });
  if (error && error.code !== "23505") throw new Error(error.message); // 23505 = ya había uno pendiente
}

/** Encola varios trabajos de una vez; si alguno ya estaba pendiente, cae a uno por uno. */
export async function enqueueMany(projectId: string, topic: string, resources: string[]) {
  if (!resources.length) return;
  const { error } = await service().from("sync_jobs").insert(resources.map((resource) => ({ project_id: projectId, topic, resource })));
  if (error) {
    if (error.code !== "23505") throw new Error(error.message);
    for (const r of resources) await enqueue(projectId, topic, r);
  }
}

export async function runQueue(projectId: string, opts: { maxMs?: number; max?: number; onlySource?: string } = {}) {
  const sb = service();
  // Si un proceso se cortó a mitad de camino, sus trabajos vuelven a la cola.
  await sb.from("sync_jobs").update({ status: "pendiente" }).eq("project_id", projectId).eq("status", "ejecutando").lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const end = Date.now() + (opts.maxMs ?? 20_000);
  let done = 0, failed = 0;
  while (Date.now() < end && done + failed < (opts.max ?? 50)) {
    let q = sb.from("sync_jobs").select("*").eq("project_id", projectId).eq("status", "pendiente").lte("run_after", new Date().toISOString());
    if (opts.onlySource) q = q.like("source", `${opts.onlySource}%`); // las notificaciones en vivo se procesan primero, sin esperar la cola vieja
    const { data: jobs } = await q.order("id").limit(5);
    if (!jobs?.length) break;
    for (const j of jobs) {
      const { data: claimed } = await sb.from("sync_jobs").update({ status: "ejecutando" }).eq("id", j.id).eq("status", "pendiente").select("id");
      if (!claimed?.length) continue;
      try {
        await processJob(projectId, j.topic, j.resource);
        await sb.from("sync_jobs").update({ status: "completado", finished_at: new Date().toISOString(), last_error: null }).eq("id", j.id);
        forget("db:"); forget(`ml:${projectId}`); // lo recién escrito tiene que verse en las pantallas
        done++;
      } catch (e) {
        failed++;
        const attempts = j.attempts + 1;
        await sb.from("sync_jobs").update(attempts >= 5
          ? { status: "error", attempts, last_error: (e as Error).message, finished_at: new Date().toISOString() }
          : { status: "pendiente", attempts, last_error: (e as Error).message, run_after: new Date(Date.now() + 2 ** attempts * 30_000).toISOString() }).eq("id", j.id);
      }
    }
  }
  const { count } = await sb.from("sync_jobs").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "pendiente");
  return { done, failed, remaining: count ?? 0 };
}

/* ---------- Carga completa ---------- */

/** Encola el comienzo de cada carga (es instantáneo). Cada una sigue sola, página a página. Repetirla no duplica. */
export async function backfill(projectId: string, opts: { since?: string; full?: boolean } = {}) {
  // Por defecto es INCREMENTAL: desde la última orden guardada (con 3 días de margen), preguntas nuevas hasta toparse con
  // las ya conocidas, y las publicaciones se refrescan siempre (son pocas). Solo `full` vuelve a leer todo el historial.
  let since = opts.full ? undefined : opts.since;
  if (!opts.full && !since) since = await lastOrderSince(projectId);
  const incremental = Boolean(since);
  await enqueue(projectId, "backfill_orders", `0|${since ?? ""}`);
  await enqueue(projectId, "backfill_items", "0");
  await enqueue(projectId, "backfill_questions", `0|${incremental ? "inc" : ""}`);
  return { started: incremental ? [`órdenes desde ${since}`, "publicaciones", "preguntas nuevas"] : ["órdenes", "publicaciones", "preguntas"] };
}

/** Fecha desde la que hay que repasar: la de la última orden guardada menos 3 días. Sin órdenes guardadas = carga completa. */
async function lastOrderSince(projectId: string): Promise<string | undefined> {
  const { data } = await service().from("ml_resources").select("data").eq("project_id", projectId).eq("kind", "order").order("data->>date_created", { ascending: false }).limit(1);
  const last = data?.[0]?.data?.date_created as string | undefined;
  if (!last) return undefined;
  return new Date(new Date(last).getTime() - 3 * 86400000).toISOString().slice(0, 10);
}

/** Visitas: total, evolución diaria y por publicación (la API admite hasta 150 días por consulta). */
export async function syncVisits(projectId: string, days = 30) {
  const sb = service();
  const { mlUserId } = await getAccessToken(projectId);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date(), from = new Date(Date.now() - days * 86400000);
  await saveResource(projectId, "visits_total", `last${days}`, { date_from: f(from), date_to: f(to), ...(await mlGet<R>(projectId, `/users/${mlUserId}/items_visits`, { date_from: f(from), date_to: f(to) })) });
  await saveResource(projectId, "visits_daily", `last${days}`, await mlGet(projectId, `/users/${mlUserId}/items_visits/time_window`, { last: days, unit: "day" }));
  // La API solo admite una publicación por consulta de visitas.
  const { data: items } = await sb.from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "item");
  for (const it of items ?? []) {
    const r = await mlGet<R>(projectId, `/items/${it.ml_id}/visits/time_window`, { last: days, unit: "day" }).catch(() => null);
    if (r) await saveResource(projectId, "item_visits", String(it.ml_id), { item_id: it.ml_id, total_visits: Number(r.total_visits ?? 0), date_from: f(from), date_to: f(to), results: r.results ?? [] });
  }
}

/**
 * Promociones activas y publicidad paga (Product Ads) de cada publicación. Es información extra: si Mercado Libre no la entrega
 * (permiso, versión de la API o cuenta sin publicidad), se guarda el motivo y la sincronización sigue sin errores.
 */
export async function syncPromoAds(projectId: string) {
  const { data: items } = await service().from("ml_resources").select("ml_id").eq("project_id", projectId).eq("kind", "item");
  for (const it of items ?? []) {
    const id = String(it.ml_id);
    try {
      const r = await mlGet<unknown>(projectId, `/seller-promotions/items/${id}`, { app_version: "v2" });
      await saveResource(projectId, "item_promos", id, { item_id: id, results: Array.isArray(r) ? r : (r as R)?.results ?? [] });
    } catch (e) {
      await saveResource(projectId, "item_promos", id, { item_id: id, results: [], error: (e as Error).message });
    }
  }
  try {
    const adv = await mlGet<R>(projectId, "/advertising/advertisers", { product_id: "PADS" }, { "Api-Version": "1" });
    const advertiser = (adv.advertisers?.[0] ?? adv.results?.[0]) as R | undefined;
    if (!advertiser?.advertiser_id) { await saveResource(projectId, "ads", "all", { results: [], error: "Sin cuenta de publicidad" }); return; }
    const site = String(advertiser.site_id ?? "MLA");
    const ads: R[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const page = await mlGet<R>(projectId, `/advertising/${site}/advertisers/${advertiser.advertiser_id}/product_ads/ads/search`, { limit: 50, offset }, { "Api-Version": "2" });
      const list = (page.results ?? []) as R[];
      ads.push(...list);
      if (list.length < 50) break;
    }
    await saveResource(projectId, "ads", "all", { advertiser_id: advertiser.advertiser_id, results: ads });
  } catch (e) {
    await saveResource(projectId, "ads", "all", { results: [], error: (e as Error).message });
  }
}

/** Perfil y reputación de la cuenta. */
export async function syncUser(projectId: string) {
  const { mlUserId } = await getAccessToken(projectId);
  await saveResource(projectId, "user", String(mlUserId), await mlGet(projectId, `/users/${mlUserId}`));
}

/* ---------- Registro de sincronizaciones ---------- */

export async function withLog<T>(projectId: string, kind: string, fn: () => Promise<{ processed: number; errors: number; detail?: unknown } & Partial<T>>) {
  const sb = service();
  // Corridas que quedaron a medias (por ejemplo, por un reinicio del servidor) se marcan como interrumpidas.
  await sb.from("sync_logs").update({ status: "interrumpida", finished_at: new Date().toISOString() }).eq("project_id", projectId).eq("status", "ejecutando").lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const { data: log } = await sb.from("sync_logs").insert({ project_id: projectId, kind }).select("id").single();
  try {
    const r = await fn();
    await sb.from("sync_logs").update({ finished_at: new Date().toISOString(), processed: r.processed, errors: r.errors, status: r.errors ? "error parcial" : "completado", detail: r.detail ?? null }).eq("id", log!.id);
    return r;
  } catch (e) {
    await sb.from("sync_logs").update({ finished_at: new Date().toISOString(), errors: 1, status: "error", detail: { message: (e as Error).message } }).eq("id", log!.id);
    throw e;
  }
}

/** Preguntas que llevan más de una hora sin responder: un solo recordatorio por pregunta (queda anotado), con todas juntas. */
export async function remindPendingQuestions(projectId: string) {
  const sb = service();
  const { data: qs } = await sb.from("ml_resources").select("ml_id,st:data->>status,created:data->>date_created").eq("project_id", projectId).eq("kind", "question").limit(5000);
  const now = Date.now();
  const due = (qs ?? []).filter((q) => q.st === "UNANSWERED" && now - new Date(String(q.created)).getTime() > 3600_000 && now - new Date(String(q.created)).getTime() < 48 * 3600_000).map((q) => String(q.ml_id));
  if (!due.length) return 0;
  const { data: keys } = await sb.from("message_reads").select("key").eq("project_id", projectId).or(due.map((id) => `key.eq.reminded:${id}`).concat(due.map((id) => `key.eq.${doneKey(mlQuestionKey(id))}`)).join(",")).limit(5000);
  const skip = new Set((keys ?? []).map((k) => String(k.key)));
  const pending = due.filter((id) => !skip.has(`reminded:${id}`) && !skip.has(doneKey(mlQuestionKey(id))));
  if (!pending.length) return 0;
  const sent = await sendPhoneAlert(projectId, { title: "Preguntas sin responder", message: `${pending.length} pregunta${pending.length === 1 ? "" : "s"} de Mercado Libre llevan más de una hora sin respuesta.`, priority: 5 });
  if (sent) await sb.from("message_reads").upsert(pending.map((id) => ({ project_id: projectId, key: `reminded:${id}` })), { onConflict: "project_id,key" });
  return pending.length;
}

/** Procesa la cola hasta vaciarla (o agotar el tiempo). Pensado para correr en segundo plano. */
export async function drain(projectId: string, kind: string, maxMs = 240_000) {
  return withLog(projectId, kind, async () => {
    const q = await runQueue(projectId, { maxMs, max: 5000 });
    await syncUser(projectId).catch(() => {});
    await syncVisits(projectId, 30).catch(() => {});
    await syncPromoAds(projectId).catch(() => {});
    await queueMissingShipments(projectId).catch(() => {});
    await queueMissingBilling(projectId).catch(() => {});
    await applyStoredBilling(projectId).catch(() => {});
    await remindPendingQuestions(projectId).catch(() => {});
    return { processed: q.done, errors: q.failed, detail: { restantes: q.remaining } };
  });
}

/**
 * Sincronización programada: repasa los últimos días y vacía la cola de cada cuenta conectada.
 * Si otra corrida (de esta u otra instancia) arrancó hace poco, no se superpone.
 */
export async function runScheduledSync(opts: { full?: boolean; maxMs?: number; minGapMs?: number } = {}) {
  const sb = service();
  const { data: accounts } = await sb.from("ml_accounts").select("project_id").eq("status", "connected");
  const results: unknown[] = [];
  for (const a of accounts ?? []) {
    if (opts.minGapMs) {
      const { data: last } = await sb.from("sync_logs").select("started_at").eq("project_id", a.project_id).eq("kind", "programada").order("started_at", { ascending: false }).limit(1);
      if (last?.[0] && Date.now() - new Date(last[0].started_at).getTime() < opts.minGapMs) { results.push({ skipped: true }); continue; }
    }
    await backfill(a.project_id, { full: opts.full });
    results.push(await drain(a.project_id, "programada", opts.maxMs ?? 50_000).catch((e) => ({ processed: 0, errors: 1, detail: { message: (e as Error).message } })));
    await autoWelcome(a.project_id).catch(() => {});
    await refreshRecentConversations(a.project_id).catch(() => {});
    await closeDelivered(a.project_id).catch(() => {});
    await syncClaims(a.project_id).catch(() => {});
    await settleRefunds(a.project_id).catch(() => {});
  }
  return results;
}
