import { forget } from "@/lib/memo";
import { inAgenda } from "@/modules/customers";
import { addInboxMessage } from "@/modules/inbox";
import { service } from "@/modules/repo/supabase";
import { TN_API, TN_USER_AGENT } from "./config";
import { getTnAccount } from "./oauth";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CHANNEL = "Tienda Nube";
// Tienda Nube no informa lo que descuenta el medio de pago: el neto es una estimación (la misma que se usó en la venta cargada a mano).
export const TN_FEE_PCT = 5.6;

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Textos de Tienda Nube vienen por idioma: { es: "…" }. */
const txt = (v: unknown): string => (typeof v === "string" ? v : v && typeof v === "object" ? String((v as R).es ?? Object.values(v as R)[0] ?? "") : "");
/** Fecha calendario en Argentina (un pedido de las 22 h no debe figurar como del día siguiente). */
const day = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }) : new Date().toISOString().slice(0, 10));

/* ---------- API ---------- */

export async function api<T>(projectId: string, path: string, init?: { method?: string; body?: unknown }): Promise<{ data: T; total: number | null }> {
  const acc = await getTnAccount(projectId);
  if (!acc) throw new Error("Tienda Nube no está conectada.");
  const res = await fetch(`${TN_API}/${acc.storeId}${path}`, {
    method: init?.method ?? "GET",
    headers: { authentication: `bearer ${acc.token}`, "user-agent": TN_USER_AGENT, ...(init?.body ? { "content-type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); return api(projectId, path, init); } // límite de pedidos: se espera y se reintenta
  if (res.status === 404 && (init?.method ?? "GET") === "GET") return { data: (path.includes("?") || path.endsWith("s") ? [] : null) as T, total: 0 };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Tienda Nube respondió ${res.status}${body?.description ? `: ${body.description}` : ""}`);
  }
  return { data: (await res.json()) as T, total: res.headers.get("x-total-count") ? Number(res.headers.get("x-total-count")) : null };
}

/** Lista paginada (200 por página). `deadline` corta la lectura si se agota el tiempo de la función. */
async function listAll(projectId: string, path: string, deadline: number): Promise<R[]> {
  const out: R[] = [];
  for (let page = 1; page <= 100 && Date.now() < deadline; page++) {
    const { data } = await api<R[]>(projectId, `${path}${path.includes("?") ? "&" : "?"}per_page=200&page=${page}`);
    if (!Array.isArray(data) || !data.length) break;
    out.push(...data);
    if (data.length < 200) break;
  }
  return out;
}

async function saveResources(projectId: string, kind: string, entries: [string, unknown][]) {
  const at = new Date().toISOString();
  for (const part of chunk(entries, 200)) {
    const { error } = await service().from("tn_resources").upsert(part.map(([tn_id, data]) => ({ project_id: projectId, kind, tn_id, data, fetched_at: at })));
    if (error) throw new Error(`No se pudo guardar ${kind}: ${error.message}`);
  }
}

/* ---------- Productos → publicaciones del CRM ---------- */

const slugOf = (url: string) => /\/productos\/([^/?#]+)/.exec(url)?.[1]?.toLowerCase() ?? "";

/** Estado de la publicación según Tienda Nube: no publicado = pausado; publicado sin stock = sin stock. */
function listingStatus(p: R): "active" | "paused" | "out_of_stock" {
  if (p.published === false) return "paused";
  const variants = (p.variants ?? []) as R[];
  const unlimited = variants.some((v) => v.stock === null || v.stock === undefined);
  return unlimited || variants.some((v) => num(v.stock) > 0) ? "active" : "out_of_stock";
}

export async function processProducts(projectId: string, products: R[]) {
  if (!products.length) return { linked: 0, created: 0 };
  const sb = service();
  await saveResources(projectId, "product", products.map((p) => [String(p.id), p]));

  const [{ data: ours }, { data: links }] = await Promise.all([
    sb.from("products").select("id,name,listings,kind").eq("project_id", projectId),
    sb.from("tn_item_links").select("tn_product_id,product_id").eq("project_id", projectId),
  ]);
  const have = new Set((ours ?? []).map((p) => p.id as string));
  const linkMap = new Map((links ?? []).map((l) => [l.tn_product_id as string, l.product_id as string]));
  const bySlug = new Map<string, string>();
  for (const p of ours ?? []) for (const l of (p.listings ?? []) as { channel: string; url?: string }[]) if (l.channel === CHANNEL && l.url) bySlug.set(slugOf(l.url), p.id as string);
  const byName = new Map((ours ?? []).filter((p) => p.kind !== "componente" && p.kind !== "consumible").map((p) => [norm(p.name as string), p.id as string]));

  const newLinks: R[] = [], fresh: R[] = [];
  const target = new Map<string, string>(); // tn product id → producto del CRM
  for (const p of products) {
    const id = String(p.id);
    let pid = linkMap.get(id);
    if (pid && !have.has(pid)) pid = undefined; // el producto vinculado ya no existe
    pid ??= bySlug.get(slugOf(txt(p.canonical_url) || `/productos/${txt(p.handle)}`)) ?? byName.get(norm(txt(p.name)));
    if (!pid) {
      pid = `tni_${id}`;
      const v0 = ((p.variants ?? []) as R[])[0] ?? {};
      fresh.push({
        id: pid, project_id: projectId, sku: String(v0.sku || id), name: txt(p.name) || `Producto ${id}`, kind: "venta", unit: "unidad", cost: 0, price: num(v0.price), track_stock: false,
        category: "",
      });
    }
    target.set(id, pid);
    if (linkMap.get(id) !== pid) newLinks.push({ project_id: projectId, tn_product_id: id, product_id: pid });
  }
  if (fresh.length) await sb.from("products").upsert(fresh, { onConflict: "id", ignoreDuplicates: true });
  for (const part of chunk(newLinks, 200)) await sb.from("tn_item_links").upsert(part, { onConflict: "project_id,tn_product_id" });

  // La publicación (estado, precio, link) de cada producto acompaña a Tienda Nube; las de otros canales no se tocan.
  const listingsOf = new Map((ours ?? []).map((p) => [p.id as string, (p.listings ?? []) as R[]]));
  for (const p of products) {
    const pid = target.get(String(p.id))!;
    const variants = (p.variants ?? []) as R[];
    const price = Math.min(...variants.map((v) => num(v.promotional_price) || num(v.price)).filter((n) => n > 0), Infinity);
    const mine: R = {
      channel: CHANNEL, status: listingStatus(p), price: Number.isFinite(price) ? price : 0,
      url: txt(p.canonical_url) || (txt(p.handle) ? `https://tu-tienda.com/productos/${txt(p.handle)}/` : ""),
    };
    const rest = (listingsOf.get(pid) ?? []).filter((l) => l.channel !== CHANNEL);
    listingsOf.set(pid, [...rest, mine]);
  }
  for (const [pid, listings] of listingsOf) {
    if (![...target.values()].includes(pid)) continue;
    await sb.from("products").update({ listings }).eq("project_id", projectId).eq("id", pid);
  }
  forget("db:");
  return { linked: newLinks.length, created: fresh.length };
}

/** Productos que figuraban en Tienda Nube y ya no existen allá: la publicación pasa a pausada (el producto del CRM se conserva). */
async function markGoneProducts(projectId: string, seen: Set<string>) {
  const sb = service();
  const { data: rows } = await sb.from("tn_item_links").select("tn_product_id,product_id").eq("project_id", projectId);
  for (const l of rows ?? []) {
    if (seen.has(String(l.tn_product_id))) continue;
    const { data: p } = await sb.from("products").select("listings").eq("id", l.product_id).eq("project_id", projectId).maybeSingle();
    const ls = ((p?.listings ?? []) as R[]).map((x) => (x.channel === CHANNEL && x.status !== "paused" ? { ...x, status: "paused" } : x));
    if (p) await sb.from("products").update({ listings: ls }).eq("id", l.product_id).eq("project_id", projectId);
  }
}

/* ---------- Pedidos → ventas, clientes, envíos y stock ---------- */

const shipStageOf = (status: string, cancelled: boolean) => {
  if (cancelled) return "no_entregado";
  if (status === "delivered") return "entregado";
  if (status === "shipped") return "en_viaje";
  if (status === "fulfilled" || status === "packed") return "empaquetado";
  return "compra";
};

export async function processOrders(projectId: string, orders: R[]) {
  if (!orders.length) return { created: 0, updated: 0 };
  const sb = service();
  const acc = await getTnAccount(projectId);
  await saveResources(projectId, "order", orders.map((o) => [String(o.id), o]));

  const [{ data: prods }, { data: links }, { data: st }] = await Promise.all([
    sb.from("products").select("id,name").eq("project_id", projectId),
    sb.from("tn_item_links").select("tn_product_id,product_id").eq("project_id", projectId),
    sb.from("project_settings").select("shipment_stages").eq("project_id", projectId).single(),
  ]);
  const byName = new Map((prods ?? []).map((p) => [norm(p.name as string), p.id as string]));
  const names = new Map((prods ?? []).map((p) => [p.id as string, p.name as string]));
  const linkMap = new Map((links ?? []).map((l) => [l.tn_product_id as string, l.product_id as string]));
  const stages = ((st?.shipment_stages ?? []) as { id: string }[]).map((x) => x.id);
  const stageFor = (id: string) => (stages.includes(id) ? id : (stages[0] ?? id));

  // Productos de líneas que todavía no están vinculados: se crean sin costo para completar después.
  const fresh = new Map<string, R>();
  const productOf = (l: R) => linkMap.get(String(l.product_id)) ?? byName.get(norm(txt(l.name)));
  for (const o of orders) for (const l of (o.products ?? []) as R[]) {
    if (productOf(l)) continue;
    const id = `tni_${l.product_id}`;
    fresh.set(id, { id, project_id: projectId, sku: String(l.sku || l.product_id), name: txt(l.name), category: "", unit: "unidad", cost: 0, price: num(l.price), track_stock: false, kind: "venta" });
    linkMap.set(String(l.product_id), id);
    names.set(id, txt(l.name));
  }
  if (fresh.size) {
    await sb.from("products").upsert([...fresh.values()], { onConflict: "id", ignoreDuplicates: true });
    await sb.from("tn_item_links").upsert([...fresh.keys()].map((id) => ({ project_id: projectId, tn_product_id: id.replace("tni_", ""), product_id: id })), { onConflict: "project_id,tn_product_id", ignoreDuplicates: true });
  }

  // Clientes: solo con lo que informa Tienda Nube. Si la persona ya existe (mismo correo o teléfono), se usa esa ficha en lugar de crear otra.
  const { data: known } = await sb.from("customers").select("id,phone,email").eq("project_id", projectId);
  const d10 = (v: string) => v.replace(/\D/g, "").slice(-10);
  const knownIds = new Set((known ?? []).map((k) => String(k.id)));
  const byEmail = new Map((known ?? []).filter((k) => k.email).map((k) => [String(k.email).trim().toLowerCase(), String(k.id)]));
  const byPhone = new Map((known ?? []).filter((k) => d10(String(k.phone ?? "")).length >= 8).map((k) => [d10(String(k.phone)), String(k.id)]));
  const cidOf = (o: R): string | null => {
    const c = (o.customer ?? {}) as R;
    const base = c.id ? `tnc_${c.id}` : o.contact_email ? `tnc_e_${norm(String(o.contact_email))}` : null;
    if (!base) return null;
    if (knownIds.has(base)) return base;
    const mail = String(c.email || o.contact_email || "").trim().toLowerCase();
    const ph = d10(String(c.phone || o.contact_phone || ""));
    return (mail && byEmail.get(mail)) || (ph.length >= 8 && byPhone.get(ph)) || base;
  };
  const buyers = new Map<string, R>();
  for (const o of orders) {
    const c = (o.customer ?? {}) as R;
    const cid = cidOf(o);
    if (cid) buyers.set(cid, { ...c, _order: o });
  }
  const { data: haveRows } = await sb.from("customers").select("*").eq("project_id", projectId).in("id", [...buyers.keys()]);
  const haveMap = new Map((haveRows ?? []).map((c) => [c.id as string, c]));
  const customerRows = [...buyers].map(([id, c]) => {
    const o = c._order as R, a = (o.shipping_address ?? c.default_address ?? {}) as R, old = haveMap.get(id) ?? {};
    return {
      id, project_id: projectId, origin: CHANNEL, name: txt(c.name) || txt(o.contact_name) || old.name || "Cliente Tienda Nube",
      company: old.company ?? "", phone: String(c.phone || o.contact_phone || old.phone || ""), email: String(c.email || o.contact_email || old.email || ""),
      city: [a.city, a.province].filter(Boolean).join(", ") || old.city || "", address: [a.address, a.number, a.floor].filter(Boolean).join(" ") || old.address || "",
      doc: String(c.identification || o.contact_identification || old.doc || ""), created_at: old.created_at ?? day(o.created_at),
    };
  }).map((r) => ({ ...r, is_full: inAgenda({ name: r.name, phone: r.phone, address: r.address, agendaOff: haveMap.get(r.id)?.agenda_off }) }));
  const toSave = customerRows.filter((c) => !haveMap.get(c.id)?.is_full);
  if (toSave.length) await sb.from("customers").upsert(toSave);

  // Ventas: las que ya existen solo se corrigen ante una cancelación o reembolso (o un cobro que entró después).
  const saleIds = orders.map((o) => `tn_${o.id}`);
  const { data: existing } = await sb.from("sales").select("id,status,pay_status").eq("project_id", projectId).in("id", saleIds);
  const exMap = new Map((existing ?? []).map((s) => [s.id as string, s]));
  const { data: maxRow } = await sb.from("sales").select("number").eq("project_id", projectId).order("number", { ascending: false }).limit(1);
  let number = maxRow?.[0]?.number ?? 1000;
  const news: R[] = [];
  let updated = 0;
  const cutoff = acc ? day(acc.connectedAt) : day(new Date());
  for (const o of [...orders].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const id = `tn_${o.id}`;
    const cancelled = o.status === "cancelled" || ["voided", "abandoned"].includes(String(o.payment_status));
    const refunded = String(o.payment_status) === "refunded";
    const paid = String(o.payment_status) === "paid";
    const payStatus = refunded ? "reembolsada" : "cobrada";
    const ex = exMap.get(id);
    if (ex) {
      const patch: R = {};
      if ((cancelled || refunded) && ex.status !== "cancelada") {
        patch.status = "cancelada";
        // Cancelada en todo sentido: el stock descontado por esta venta vuelve.
        await sb.from("stock_movements").delete().eq("project_id", projectId).eq("ref", `TN-${o.id}`);
      }
      if (refunded && ex.pay_status !== "reembolsada") patch.pay_status = "reembolsada";
      if (Object.keys(patch).length) { await sb.from("sales").update(patch).eq("id", id).eq("project_id", projectId); updated++; }
      continue;
    }
    // Un pedido sin cobrar todavía no es una venta: entra cuando Tienda Nube avisa el pago.
    if (!paid && !refunded) continue;
    const lines = (o.products ?? []) as R[];
    const subtotal = lines.reduce((s, l) => s + num(l.price) * num(l.quantity), 0);
    const discountPct = subtotal > 0 ? Math.min(100, (num(o.discount) / subtotal) * 100) : 0;
    // Neto estimado sobre lo que se cobra por los productos (el envío que paga el cliente no es ingreso de la venta).
    const base = Math.max(0, num(o.total) - num(o.shipping_cost_customer));
    const gateway = txt(o.gateway_name) || String(o.gateway ?? "");
    news.push({
      id, project_id: projectId, number: ++number, customer_id: cidOf(o),
      date: day(o.created_at), channel: CHANNEL, status: cancelled || refunded ? "cancelada" : o.shipping_status === "delivered" ? "entregado" : "pendiente",
      pay_method: /mercado\s*pago/i.test(gateway) ? "Mercado Pago" : /transfer/i.test(gateway) ? "Transferencia" : gateway || "Tienda Nube",
      extra_costs: 0, net_amount: cancelled || refunded ? 0 : Math.round(base * (1 - TN_FEE_PCT / 100) * 100) / 100, pay_status: payStatus,
      items: lines.map((l) => ({ productId: productOf(l) ?? linkMap.get(String(l.product_id)), qty: num(l.quantity), unitPrice: num(l.price), discountPct: Math.round(discountPct * 100) / 100 })),
      _order: o,
    });
  }
  const rows = news.map(({ _order, ...r }) => r); // eslint-disable-line @typescript-eslint/no-unused-vars
  for (const part of chunk(rows, 100)) {
    const { error } = await sb.from("sales").insert(part);
    if (error) throw new Error(`No se pudieron guardar ventas: ${error.message}`);
  }
  const live = news.filter((n) => n.status !== "cancelada");
  await deductStock(projectId, live.filter((n) => n.date >= cutoff));

  // Envíos: cada pedido nuevo entra en "Compra"; después la etapa solo se mueve cuando Tienda Nube informa otro estado.
  const { data: shipHave } = await sb.from("shipments").select("id,stage,ml_status").eq("project_id", projectId).in("id", saleIds);
  const shipMap = new Map((shipHave ?? []).map((s) => [s.id as string, s]));
  for (const o of orders) {
    const id = `tn_${o.id}`;
    const cancelled = o.status === "cancelled" || ["voided", "abandoned", "refunded"].includes(String(o.payment_status));
    const external = cancelled ? "cancelled" : String(o.shipping_status ?? "unpacked");
    const stage = stageFor(shipStageOf(external, cancelled));
    const a = (o.shipping_address ?? {}) as R;
    const pickup = String(o.shipping_pickup_type ?? "") === "pickup";
    const ex = shipMap.get(id);
    if (ex) {
      const patch: R = { ml_status: external };
      if (ex.ml_status !== external) patch.stage = stage;
      if (o.shipping_tracking_number) patch.tracking = String(o.shipping_tracking_number);
      await sb.from("shipments").update(patch).eq("id", id).eq("project_id", projectId);
      continue;
    }
    const sale = news.find((n) => n.id === id);
    if (cancelled || !sale) continue; // sin venta (sin cobrar o cancelado) no hay seguimiento
    const items = ((sale?.items ?? ((o.products ?? []) as R[]).map((l) => ({ productId: productOf(l), qty: num(l.quantity) }))) as { productId: string; qty: number }[])
      .map((i) => `${i.qty} × ${names.get(i.productId) ?? "Producto"}`).join(" · ");
    await sb.from("shipments").insert({
      id, project_id: projectId, sale_id: id, order_ref: `#${o.number}`, channel: CHANNEL, customer: txt(a.name) || txt(o.contact_name),
      phone: String(a.phone || o.contact_phone || ""), address: pickup ? "Retira por el local" : [a.address, a.number, a.floor, a.locality].filter(Boolean).join(" "),
      city: [a.city, a.province].filter(Boolean).join(", "), zip: String(a.zipcode ?? ""), items, tracking: String(o.shipping_tracking_number ?? ""), stage,
      notes: [txt(o.shipping_option), o.owner_note, o.note].filter(Boolean).join(" · "), created_at: day(o.created_at), ml_status: external,
    });
  }
  // Nota que deja el cliente al comprar: va a la bandeja de Mensajes (sin leer solo si el pedido es reciente).
  for (const o of orders) {
    const note = String(o.note ?? "").trim();
    if (!note) continue;
    const a = (o.shipping_address ?? {}) as R;
    await addInboxMessage(projectId, {
      channel: "tiendanube", kind: "nota", externalId: `order_${o.id}`, customerId: cidOf(o),
      name: txt(o.contact_name) || txt(o.customer?.name), phone: String(o.contact_phone || a.phone || ""), email: String(o.contact_email || ""), subject: `Nota en el pedido #${o.number}`, link: "/ventas",
    }, { id: "nota", direction: "in", body: note, at: String(o.created_at) }, { markUnread: Date.now() - new Date(String(o.created_at)).getTime() < 7 * 86400000 }).catch(() => {});
  }
  forget("db:");
  return { created: news.length, updated };
}

/** Carritos abandonados de los últimos 14 días (con datos de contacto) a la bandeja de Mensajes, para poder escribirles. Si la tienda no lo permite, se omite. */
export async function syncCheckouts(projectId: string, deadline: number) {
  let list: R[] = [];
  try {
    list = await listAll(projectId, `/checkouts?updated_at_min=${encodeURIComponent(new Date(Date.now() - 14 * 86400000).toISOString())}`, deadline);
  } catch { return 0; }
  let n = 0;
  for (const c of list) {
    if (c.completed_at) continue;
    const phone = String(c.contact_phone ?? ""), email = String(c.contact_email ?? "");
    if (!phone && !email) continue;
    const lines = ((c.products ?? []) as R[]).map((p) => `${num(p.quantity)} × ${txt(p.name)}`).join(" · ");
    const total = num(c.total);
    await addInboxMessage(projectId, {
      channel: "tiendanube", kind: "carrito", externalId: `checkout_${c.id}`, name: txt(c.contact_name) || email || phone, phone, email,
      subject: `Carrito abandonado${total ? ` · $ ${Math.round(total).toLocaleString("es-AR")}` : ""}`, link: String(c.abandoned_checkout_url ?? ""),
    }, { id: "carrito", direction: "in", body: `Dejó en el carrito: ${lines || "productos"}${c.abandoned_checkout_url ? `\nLink para retomar la compra: ${c.abandoned_checkout_url}` : ""}`, at: String(c.created_at ?? new Date().toISOString()) },
    { markUnread: Date.now() - new Date(String(c.created_at ?? 0)).getTime() < 3 * 86400000 }).then(() => { n++; }).catch(() => {});
  }
  return n;
}

/** Descuenta el stock de las ventas nuevas (un kit descuenta cada componente), igual que en Mercado Libre. */
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
        rows.push({ id: `tnm_${sale.id.replace("tn_", "")}_${i}_${j}`, project_id: projectId, product_id: m.id, type: "egreso", qty: -m.qty, date: sale.date, reason: "Venta Tienda Nube", ref: `TN-${sale.id.replace("tn_", "")}` })));
  for (const part of chunk(rows, 100)) {
    const { error } = await sb.from("stock_movements").upsert(part, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`No se pudo descontar el stock: ${error.message}`);
  }
}

/* ---------- Sincronización completa e individual ---------- */

export const WEBHOOK_EVENTS = ["order/created", "order/updated", "order/paid", "order/cancelled", "order/fulfilled", "order/packed", "product/created", "product/updated", "product/deleted"];

/** Registra en Tienda Nube los avisos en vivo hacia el CRM (si ya están, no duplica). */
export async function registerWebhooks(projectId: string, baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/tiendanube/webhooks/events`;
  const { data: current } = await api<R[]>(projectId, "/webhooks?per_page=200");
  const have = new Set((Array.isArray(current) ? current : []).filter((w) => w.url === url).map((w) => String(w.event)));
  const done: string[] = [], failed: string[] = [];
  for (const event of WEBHOOK_EVENTS) {
    if (have.has(event)) { done.push(event); continue; }
    try { await api(projectId, "/webhooks", { method: "POST", body: { event, url } }); done.push(event); } catch { failed.push(event); }
  }
  return { done, failed };
}

/** Trae productos y pedidos. Por defecto es incremental (pedidos actualizados en los últimos días); `full` repasa todo el historial. */
export async function syncAll(projectId: string, opts: { full?: boolean; maxMs?: number } = {}) {
  const deadline = Date.now() + (opts.maxMs ?? 50_000);
  const sb = service();
  const { data: log } = await sb.from("sync_logs").insert({ project_id: projectId, kind: "tiendanube" }).select("id").single();
  try {
    const products = await listAll(projectId, "/products", deadline);
    const p = await processProducts(projectId, products);
    await markGoneProducts(projectId, new Set(products.map((x) => String(x.id))));

    const since = opts.full ? "" : `&updated_at_min=${encodeURIComponent(new Date(Date.now() - 3 * 86400000).toISOString())}`;
    const orders = await listAll(projectId, `/orders?${since.slice(1)}`, deadline);
    let created = 0, updated = 0;
    for (const part of chunk(orders, 100)) {
      const r = await processOrders(projectId, part);
      created += r.created; updated += r.updated;
    }
    const carritos = await syncCheckouts(projectId, deadline);
    const detail = { carritos, productos: products.length, vinculados: p.linked, creados: p.created, pedidos: orders.length, ventasNuevas: created, ventasActualizadas: updated };
    await sb.from("sync_logs").update({ finished_at: new Date().toISOString(), processed: products.length + orders.length, errors: 0, status: "completado", detail }).eq("id", log!.id);
    return detail;
  } catch (e) {
    await sb.from("sync_logs").update({ finished_at: new Date().toISOString(), errors: 1, status: "error", detail: { message: (e as Error).message } }).eq("id", log!.id);
    throw e;
  }
}

/** Un solo recurso (lo usan los avisos en vivo). */
export async function syncOne(projectId: string, kind: "order" | "product", id: string) {
  if (kind === "order") {
    const { data } = await api<R>(projectId, `/orders/${id}`);
    if (data?.id) await processOrders(projectId, [data]);
  } else {
    const { data } = await api<R>(projectId, `/products/${id}`);
    if (data?.id) await processProducts(projectId, [data]);
  }
}

/** Producto borrado en Tienda Nube: su publicación pasa a pausada (el producto del CRM se conserva). */
export async function productDeleted(projectId: string, id: string) {
  const sb = service();
  const { data: link } = await sb.from("tn_item_links").select("product_id").eq("project_id", projectId).eq("tn_product_id", id).maybeSingle();
  if (!link) return;
  const { data: p } = await sb.from("products").select("listings").eq("id", link.product_id).eq("project_id", projectId).maybeSingle();
  const ls = ((p?.listings ?? []) as R[]).map((x) => (x.channel === CHANNEL ? { ...x, status: "paused" } : x));
  if (p) await sb.from("products").update({ listings: ls }).eq("id", link.product_id).eq("project_id", projectId);
  forget("db:");
}

/** Corrida programada para las cuentas conectadas. */
export async function runScheduledTnSync(opts: { full?: boolean; maxMs?: number } = {}) {
  const { data: accounts } = await service().from("tn_accounts").select("project_id").eq("status", "connected");
  const results: unknown[] = [];
  for (const a of accounts ?? []) results.push(await syncAll(a.project_id, opts).catch((e) => ({ error: (e as Error).message })));
  return results;
}
