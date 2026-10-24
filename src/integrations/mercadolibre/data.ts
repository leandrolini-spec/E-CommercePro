import { memo } from "@/lib/memo";
import { service } from "@/modules/repo/supabase";

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function kind(projectId: string, k: string): Promise<{ ml_id: string; data: R }[]> {
  const { data, error } = await service().from("ml_resources").select("ml_id,data").eq("project_id", projectId).eq("kind", k).limit(5000);
  if (error) throw new Error(`No se pudo leer ${k}: ${error.message}`);
  return (data ?? []) as { ml_id: string; data: R }[];
}

/**
 * Conversaciones con los compradores, desde una vista liviana (sin los campos que el CRM no usa: ~60 % menos de datos).
 * `sinceDays` trae solo las que tuvieron un mensaje en esos últimos días; `ids` solo las de esas órdenes.
 */
async function conversations(projectId: string, opts: { sinceDays?: number; ids?: string[] } = {}): Promise<{ ml_id: string; data: R }[]> {
  let q = service().from("ml_conversations_compact").select("ml_id,data").eq("project_id", projectId);
  if (opts.sinceDays) q = q.gte("last_at", new Date(Date.now() - opts.sinceDays * 86400000).toISOString().slice(0, 10));
  if (opts.ids) q = q.in("ml_id", opts.ids.length ? opts.ids : ["-"]);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(`No se pudieron leer las conversaciones: ${error.message}`);
  return (data ?? []) as { ml_id: string; data: R }[];
}

export type MlItem = {
  id: string; title: string; status: string; price: number; originalPrice: number | null; available: number; sold: number;
  listing: string; permalink: string; created: string; visits: number; health: number | null; freeShipping: boolean; productId: string | null;
  /** Promoción especial activa (descuento, oferta del día, campaña…) y publicidad paga (Product Ads). */
  promo: string | null; ads: boolean;
};
export type MlMessage = { id: string; orderId: string; fromId: string; text: string; date: string; read: boolean; fromBuyer: boolean };
export type MlQuestion = {
  id: string; itemId: string; text: string; status: string; created: string; answer: string | null; answeredAt: string | null; buyerId: string | null;
  hoursToAnswer: number | null;
};

/** Información de Mercado Libre ya guardada en la base, lista para mostrar. */
/**
 * Datos de Mercado Libre listos para mostrar. `messages` elige cuánto traer de preguntas y conversaciones, que es lo más pesado:
 * "all" (todo, para la pantalla de Mercado Libre), un número (solo los últimos N días) o false (nada: Stock, Productos y Dashboard no las usan).
 */
export function mlData(projectId: string, opts: { messages?: "all" | number | false } = {}) {
  const m = opts.messages ?? "all";
  return memo(`ml:${projectId}:data:${m}`, process.env.VERCEL ? 0 : 20_000, () => loadMlData(projectId, m));
}

/**
 * Una compra de Mercado Libre puede ser un "pack" (varias órdenes juntas): la conversación vive bajo el número del pack, no el de la orden.
 * Devuelve el número de pack de cada orden que pertenece a uno.
 */
export async function packsOf(projectId: string, orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!orderIds.length) return out;
  const { data } = await service().from("ml_resources").select("ml_id,pack:data->pack_id").eq("project_id", projectId).eq("kind", "order").in("ml_id", orderIds);
  for (const r of data ?? []) if (r.pack) out.set(String(r.ml_id), String(r.pack));
  return out;
}

/** Número con el que se escribe al comprador: el del pack si la orden es parte de uno, o el de la orden. */
export async function conversationIdOf(projectId: string, orderId: string): Promise<string> {
  return (await packsOf(projectId, [orderId])).get(orderId) ?? orderId;
}

/** Mensajes de las conversaciones de esas órdenes (para mostrar la charla con el comprador en cada envío). */
export function mlMessagesFor(projectId: string, orderIds: string[]) {
  return memo(`ml:${projectId}:msgs:${orderIds.slice().sort().join(",")}`, process.env.VERCEL ? 0 : 20_000, async () => {
    if (!orderIds.length) return [] as MlMessage[];
    const packs = await packsOf(projectId, orderIds);
    const byPack = new Map<string, string[]>();
    for (const [o, p] of packs) byPack.set(p, [...(byPack.get(p) ?? []), o]);
    const ids = [...new Set([...orderIds, ...packs.values()])];
    const [users, convs, singles] = await Promise.all([kind(projectId, "user"), conversations(projectId, { ids }), kind(projectId, "message")]);
    const want = new Set(orderIds);
    const out: MlMessage[] = [];
    // La charla de un pack se muestra en cada orden que lo integra; los mensajes sueltos avisados por Mercado Libre completan lo que falte.
    for (const m of buildMessages(users, convs, singles)) {
      const orders = byPack.get(m.orderId);
      if (orders) for (const o of orders) out.push({ ...m, orderId: o });
      else if (want.has(m.orderId)) out.push(m);
    }
    return out;
  });
}

function buildQuestions(questions: { ml_id: string; data: R }[]): MlQuestion[] {
  return questions.map(({ data: q }) => {
    const answeredAt = q.answer?.date_created ?? null;
    return {
      id: String(q.id), itemId: String(q.item_id ?? ""), text: String(q.text ?? ""), status: String(q.status ?? ""), created: String(q.date_created ?? ""),
      answer: q.answer?.text ?? null, answeredAt, buyerId: q.from?.id ? String(q.from.id) : null,
      hoursToAnswer: answeredAt ? (new Date(answeredAt).getTime() - new Date(q.date_created).getTime()) / 3_600_000 : null,
    };
  }).sort((a, b) => b.created.localeCompare(a.created));
}

function buildMessages(users: { ml_id: string; data: R }[], conversations: { ml_id: string; data: R }[], singles: { ml_id: string; data: R }[]): MlMessage[] {
  const sellerId = String(users[0]?.data?.id ?? "");
  const msgMap = new Map<string, MlMessage>();
  const addMsgs = (list: R[], fallbackOrder: string) => {
    for (const m of list) {
      const from = String(m.from?.user_id ?? "");
      msgMap.set(String(m.id), {
        id: String(m.id), orderId: String(m.message_resources?.find((r: R) => r.name === "orders" || r.name === "packs")?.id ?? fallbackOrder), fromId: from,
        text: String(m.text ?? ""), date: String(m.message_date?.created ?? m.message_date?.received ?? ""), read: Boolean(m.message_date?.read), fromBuyer: from !== sellerId,
      });
    }
  };
  for (const c of conversations) addMsgs((c.data.messages ?? []) as R[], c.ml_id);
  for (const m of singles) addMsgs([m.data.messages?.[0] ?? m.data].filter(Boolean) as R[], "");
  return [...msgMap.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Solo mensajes y preguntas (4 consultas en lugar de 10): lo que necesita la campanita, que se consulta seguido. */
export function mlInboxData(projectId: string, sinceDays = 14) {
  return memo(`ml:${projectId}:inbox:${sinceDays}`, process.env.VERCEL ? 0 : 20_000, async () => {
    const [questions, users, convs, singles] = await Promise.all([kind(projectId, "question"), kind(projectId, "user"), conversations(projectId, { sinceDays }), kind(projectId, "message")]);
    return { questions: buildQuestions(questions), messages: buildMessages(users, convs, singles) };
  });
}

async function loadMlData(projectId: string, messages: "all" | number | false) {
  const none = Promise.resolve([] as { ml_id: string; data: R }[]);
  const [items, itemVisits, questions, daily, total, users, convs, singles, promos, adsRows] = await Promise.all([
    kind(projectId, "item"), kind(projectId, "item_visits"), messages === false ? none : kind(projectId, "question"), kind(projectId, "visits_daily"), kind(projectId, "visits_total"), kind(projectId, "user"),
    messages === false ? none : conversations(projectId, typeof messages === "number" ? { sinceDays: messages } : {}), messages === false ? none : kind(projectId, "message"), kind(projectId, "item_promos"), kind(projectId, "ads"),
  ]);
  // Promociones: la API de promociones (si respondió) o, como respaldo, un precio original mayor al actual.
  const promoBy = new Map(promos.map((p) => [p.ml_id, ((p.data.results ?? []) as R[]).filter((x) => String(x.status ?? "").toLowerCase() === "started")]));
  const adIds = new Set(((adsRows[0]?.data.results ?? []) as R[]).filter((a) => ["active", "enabled", "running"].includes(String(a.status ?? "active").toLowerCase())).map((a) => String(a.item_id ?? a.id ?? "")));
  const { data: linkRows } = await service().from("ml_item_links").select("ml_item_id,product_id").eq("project_id", projectId);
  const linkMap = new Map((linkRows ?? []).map((l) => [l.ml_item_id as string, l.product_id as string]));
  const visitsBy = new Map(itemVisits.map((v) => [v.ml_id, Number(v.data.total_visits ?? 0)]));
  const itemList: MlItem[] = items.map(({ data: d }) => ({
    id: String(d.id), title: String(d.title), status: String(d.status), price: Number(d.price ?? 0), originalPrice: d.original_price ? Number(d.original_price) : null,
    available: Number(d.available_quantity ?? 0), sold: Number(d.sold_quantity ?? 0), listing: String(d.listing_type_id ?? ""), permalink: String(d.permalink ?? ""),
    created: String(d.start_time ?? "").slice(0, 10), visits: visitsBy.get(String(d.id)) ?? 0, health: d.health == null ? null : Number(d.health),
    freeShipping: Boolean(d.shipping?.free_shipping), productId: linkMap.get(String(d.id)) ?? null,
    promo: (() => {
      const p = promoBy.get(String(d.id))?.[0];
      if (p) return String(p.name ?? p.type ?? "Promoción");
      return d.original_price && Number(d.original_price) > Number(d.price) ? "Precio con descuento" : null;
    })(),
    ads: adIds.has(String(d.id)),
  }));
  const questionList = buildQuestions(questions);
  const messagesList = buildMessages(users, convs, singles);
  const d = daily[0]?.data;
  const visitsDaily: { date: string; total: number }[] = ((d?.results ?? []) as R[]).map((r) => ({ date: String(r.date).slice(0, 10), total: Number(r.total ?? 0) })).sort((x, y) => x.date.localeCompare(y.date));
  const t = total.sort((a, b) => b.ml_id.localeCompare(a.ml_id))[0]?.data;
  const user = users[0]?.data as R | undefined;
  return {
    items: itemList, questions: questionList, messages: messagesList, visitsDaily, visitsTotal: t ? Number(t.total_visits ?? 0) : null,
    reputation: user?.seller_reputation ? {
      level: String(user.seller_reputation.level_id ?? ""), completed: Number(user.seller_reputation.transactions?.completed ?? 0), canceled: Number(user.seller_reputation.transactions?.canceled ?? 0),
      positive: Number(user.seller_reputation.transactions?.ratings?.positive ?? 0), claimsRate: Number(user.seller_reputation.metrics?.claims?.rate ?? 0),
      cancelRate: Number(user.seller_reputation.metrics?.cancellations?.rate ?? 0), delayedRate: Number(user.seller_reputation.metrics?.delayed_handling_time?.rate ?? 0),
      points: user.points == null ? null : Number(user.points),
    } : null,
  };
}

export const ITEM_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  active: { label: "Activa", tone: "success" }, paused: { label: "Pausada", tone: "warning" }, closed: { label: "Finalizada", tone: "neutral" },
  under_review: { label: "En revisión", tone: "info" }, inactive: { label: "Inactiva", tone: "neutral" }, payment_required: { label: "Pago pendiente", tone: "danger" },
};
export const Q_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ANSWERED: { label: "Respondida", tone: "success" }, UNANSWERED: { label: "Sin responder", tone: "danger" }, CLOSED_UNANSWERED: { label: "No respondida", tone: "neutral" },
  UNDER_REVIEW: { label: "En revisión", tone: "warning" }, BANNED: { label: "Bloqueada", tone: "neutral" }, DELETED: { label: "Eliminada", tone: "neutral" },
};
export const REPUTATION: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  "5_green": { label: "Verde (la mejor)", tone: "success" }, "4_light_green": { label: "Verde claro", tone: "success" }, "3_yellow": { label: "Amarilla", tone: "warning" },
  "2_orange": { label: "Naranja", tone: "warning" }, "1_red": { label: "Roja", tone: "danger" },
};
