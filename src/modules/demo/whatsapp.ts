// Datos DEMO de WhatsApp, Instagram, Tienda Nube y Meta: conversaciones, avisos y campañas ficticios armados con los clientes y ventas de ejemplo.
// Lo que se escribe o se marca en la demostración queda en memoria y no sale a ningún lado.
import { saleTotals } from "../calc";
import type { Db } from "../types";
import type { MetaCampaign, MetaReport } from "../meta-report";
import { fillTemplate, type WaDelivery, type WaTemplate } from "../whatsapp";

export type DemoMsg = { id: string; out: boolean; body: string; at: string; delivery?: WaDelivery; template?: string; sentAt?: number };
export type DemoReferral = { campaignId: string; campaign: string; headline: string };
export type DemoThread = {
  id: string; channel: "whatsapp" | "instagram" | "tiendanube"; kind: string; name: string; subject: string; preview: string; at: string;
  unread: boolean; open: boolean; phone: string; email: string; handle: string; customerId: string | null; link: string;
  messages: DemoMsg[]; referral?: DemoReferral;
};
export type DemoLogEntry = { id: string; at: string; to: string; template: string; body: string; status: "enviado" | "omitido"; reason?: string };

type Store = { out: Map<string, DemoMsg[]>; read: Set<string>; resolved: Set<string>; reopened: Set<string>; log: DemoLogEntry[] };
const g = globalThis as unknown as { __demoWa?: Store };
const store = (): Store => (g.__demoWa ??= { out: new Map(), read: new Set(), resolved: new Set(), reopened: new Set(), log: [] });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const digits = (s: string) => s.replace(/\D/g, "");

export const CAMPAIGNS: { id: string; name: string; kind: MetaCampaign["kind"]; headline: string }[] = [
  { id: "c1", name: "Termos 20 % off", kind: "whatsapp", headline: "Termos con 20 % de descuento" },
  { id: "c2", name: "Mates · Instagram", kind: "instagram", headline: "El mate que te acompaña" },
  { id: "c3", name: "Catálogo Tienda Nube", kind: "tienda", headline: "Todo el catálogo" },
  { id: "c4", name: "Remarketing carritos", kind: "tienda", headline: "Volvé por lo que dejaste" },
];

type Script = { who: number; pool: "tn" | "c"; minutes: number; unread: boolean; open: boolean; ref?: string; chat: [boolean, string, WaDelivery?][] };

/** Conversaciones de WhatsApp de ejemplo: unas desde anuncios, una con la ventana de 24 horas cerrada y una ya resuelta. */
const WA: Script[] = [
  { who: 0, pool: "tn", minutes: 12, unread: true, open: true, ref: "c1", chat: [[false, "Hola! Vi la publicidad de los termos en Instagram. ¿Todavía está la promo?"]] },
  { who: 1, pool: "tn", minutes: 190, unread: false, open: false, ref: "c1", chat: [[false, "Buenas, ¿hacen envíos a Rosario? ¿Cuánto tarda?"], [true, "¡Hola! Sí, enviamos a todo el país. A Rosario demora entre 2 y 4 días hábiles.", "read"], [false, "Genial, lo compro ahora. ¡Gracias!"]] },
  { who: 2, pool: "tn", minutes: 55, unread: true, open: true, chat: [[false, "Hola, ¿ya salió mi pedido? Lo hice el viernes."]] },
  { who: 3, pool: "c", minutes: 1800, unread: false, open: true, chat: [[false, "Quería saber si tienen el mate en otro color."]] },
  { who: 4, pool: "tn", minutes: 4300, unread: false, open: false, chat: [[false, "Gracias! Llegó perfecto, todo en orden."], [true, "¡Qué bueno! Gracias por tu compra, cualquier cosa escribinos.", "read"]] },
  { who: 5, pool: "tn", minutes: 300, unread: false, open: false, ref: "c2", chat: [[false, "Hola! Me interesa el mate de calabaza, ¿tienen stock?"], [true, "¡Hola! Sí, tenemos stock. ¿Querés que te pase el link de la tienda para comprarlo?", "delivered"]] },
  { who: 6, pool: "c", minutes: 2900, unread: false, open: true, chat: [[false, "¿Hacen factura A? Es para una empresa."]] },
  { who: 7, pool: "c", minutes: 95, unread: true, open: true, chat: [[false, "Necesito 10 unidades como regalo empresarial, ¿hacen precio por cantidad?"]] },
];

function pools(db: Db) {
  return { tn: db.customers.filter((c) => c.origin === "Tienda Nube" && c.phone), c: db.customers.filter((c) => !c.id.startsWith("mlb_") && c.origin !== "Tienda Nube" && c.phone) };
}

/** Todas las conversaciones de ejemplo, con lo que se escribió o marcó durante la demostración. */
export function demoThreads(db: Db): DemoThread[] {
  const st = store();
  const { tn, c } = pools(db);
  const out: DemoThread[] = [];
  const mk = (t: Omit<DemoThread, "preview" | "at" | "unread" | "open" | "messages"> & { chat: DemoMsg[]; unread: boolean; open: boolean }) => {
    const extra = st.out.get(t.id) ?? [];
    const messages = [...t.chat, ...extra].sort((a, b) => a.at.localeCompare(b.at));
    const last = messages.at(-1)!;
    const lastIn = [...messages].reverse().find((m) => !m.out);
    const answered = extra.length > 0 && last.out;
    const reopened = st.reopened.has(t.id);
    const open = reopened ? true : st.resolved.has(t.id) || answered ? false : t.open;
    out.push({ ...t, messages, preview: last.body, at: last.at, unread: st.read.has(t.id) || answered ? false : t.unread && Boolean(lastIn), open });
  };
  WA.forEach((s, i) => {
    const cu = (s.pool === "tn" ? tn : c)[s.who % Math.max(1, (s.pool === "tn" ? tn : c).length)];
    if (!cu) return;
    const camp = s.ref ? CAMPAIGNS.find((x) => x.id === s.ref) : undefined;
    const chat: DemoMsg[] = s.chat.map(([isOut, body, delivery], k) => ({ id: `w${i}-${k}`, out: isOut, body, at: ago(s.minutes - k * 6), delivery }));
    mk({
      id: `whatsapp:${digits(cu.phone)}`, channel: "whatsapp", kind: "mensaje", name: cu.name, subject: camp ? `Desde el anuncio «${camp.name}»` : "", phone: `+54 9 ${cu.phone}`, email: cu.email, handle: "",
      customerId: cu.id, link: `https://wa.me/54${digits(cu.phone)}`, chat, unread: s.unread, open: s.open, referral: camp ? { campaignId: camp.id, campaign: camp.name, headline: camp.headline } : undefined,
    });
  });
  const igNames = ["@lu.mate", "@casa_de_regalos", "@marian.deco"];
  const igText = ["¿Tienen envío a Mendoza? Me encantó el mate.", "Hola! ¿Hacen packs para regalo?", "¿Qué medidas tiene el organizador plegable?"];
  igNames.forEach((h, i) => mk({ id: `instagram:ig${i}`, channel: "instagram", kind: "mensaje", name: h.replace("@", ""), subject: "", phone: "", email: "", handle: h, customerId: null, link: "https://www.instagram.com/direct/inbox/", chat: [{ id: `i${i}`, out: false, body: igText[i], at: ago(240 + i * 420) }], unread: i === 0, open: true }));
  tn.slice(8, 11).forEach((cu, i) => mk({
    id: `tiendanube:nota${i}`, channel: "tiendanube", kind: "nota", name: cu.name, subject: "Nota de compra", phone: cu.phone, email: cu.email, handle: "", customerId: cu.id, link: "/ventas",
    chat: [{ id: `n${i}`, out: false, body: ["Dejar con el portero si no estoy, por favor.", "Necesito el pedido antes del viernes, es un regalo.", "Si pueden, envuelvan para regalo."][i], at: ago(600 + i * 800) }], unread: i === 0, open: true,
  }));
  tn.slice(11, 14).forEach((cu, i) => mk({
    id: `tiendanube:carrito${i}`, channel: "tiendanube", kind: "carrito", name: cu.name, subject: `Dejó ${i + 2} productos en el carrito`, phone: cu.phone, email: cu.email, handle: "", customerId: cu.id, link: "",
    chat: [{ id: `k${i}`, out: false, body: `Carrito abandonado por ${db.products[i + 1]?.name ?? "un producto"} y ${i + 1} más.`, at: ago(420 + i * 520) }], unread: false, open: true,
  }));
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Estado de entrega a mostrar: los mensajes que se mandan en la demostración pasan solos de enviado a entregado y leído. */
export function deliveryOf(m: DemoMsg): WaDelivery | undefined {
  if (!m.out) return undefined;
  if (m.sentAt) { const s = (Date.now() - m.sentAt) / 1000; return s < 5 ? "sent" : s < 12 ? "delivered" : "read"; }
  return m.delivery ?? "read";
}

export function demoReply(threadId: string, text: string, template?: string) {
  const st = store();
  const list = st.out.get(threadId) ?? [];
  list.push({ id: `d${Date.now()}${list.length}`, out: true, body: text, at: new Date().toISOString(), sentAt: Date.now(), template });
  st.out.set(threadId, list);
}
export function demoSetState(id: string, state: "leido" | "resuelto" | "abierto") {
  const st = store();
  if (state === "leido") st.read.add(id);
  if (state === "resuelto") { st.resolved.add(id); st.read.add(id); st.reopened.delete(id); }
  if (state === "abierto") { st.reopened.add(id); st.resolved.delete(id); }
}
export function demoMarkAllRead(db: Db) { for (const t of demoThreads(db)) if (t.unread) store().read.add(t.id); }

/** Registro de avisos automáticos de la demostración (lo que se hubiera enviado). */
export const demoLog = () => store().log;
export function demoLogAdd(e: Omit<DemoLogEntry, "id" | "at">) { store().log.unshift({ id: `l${Date.now()}${store().log.length}`, at: new Date().toISOString(), ...e }); store().log.splice(60); }

/** Texto de una plantilla con las variables de ejemplo. */
export const previewTemplate = (t: Pick<WaTemplate, "body" | "vars">, examples: Record<string, string>) => fillTemplate(t.body, t.vars.map((v) => examples[v] ?? v));

/* ---- Meta: gasto por campaña y ventas atribuidas (30 días) ---- */
export function demoMeta(db: Db, from: string, to: string): MetaReport {
  const lcg = (seed: number) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); };
  const days: string[] = [];
  for (let d = new Date(from + "T12:00:00Z"); d.toISOString().slice(0, 10) <= to && days.length < 400; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const base: Record<string, number> = { c1: 4200, c2: 2400, c3: 3000, c4: 1100 };
  const campaigns: MetaCampaign[] = CAMPAIGNS.map((c) => ({ id: c.id, name: c.name, kind: c.kind, spend: 0, impressions: 0, clicks: 0, conversations: 0, sales: 0, revenue: 0 }));
  const spendByDay = new Map<string, number>(), revByDay = new Map<string, number>();
  campaigns.forEach((c, ci) => {
    const r = lcg(97 + ci * 31);
    for (const d of days) {
      const spend = Math.round(base[c.id] * (0.7 + r() * 0.6) / 100) * 100;
      const clicks = Math.round(spend / (110 + r() * 60));
      c.spend += spend; c.clicks += clicks; c.impressions += clicks * Math.round(38 + r() * 20);
      spendByDay.set(d, (spendByDay.get(d) ?? 0) + spend);
    }
    c.conversations = c.kind === "tienda" ? 0 : Math.round(c.clicks * (c.kind === "whatsapp" ? 0.19 : 0.11));
  });
  // Ventas atribuidas: compras dentro de la ventana de 30 días de clientes que vinieron por un anuncio (reparto fijo por cliente).
  const attributable = db.sales.filter((s) => s.status !== "cancelada" && s.date >= from && s.date <= to && s.channel !== "Mercado Libre");
  for (const s of attributable) {
    const h = [...s.customerId].reduce((a, ch) => a + ch.charCodeAt(0), 0) + s.number;
    if (h % 100 >= 46) continue;
    const kind: MetaCampaign["kind"] = s.channel === "Instagram" ? "instagram" : s.channel === "Tienda Nube" ? "tienda" : "whatsapp";
    const options = campaigns.filter((c) => c.kind === kind);
    const camp = options[h % options.length];
    const revenue = saleTotals(db, s).revenue;
    camp.sales += 1; camp.revenue += revenue;
    revByDay.set(s.date, (revByDay.get(s.date) ?? 0) + revenue);
  }
  return { connected: true, demo: true, campaigns, attributionDays: 30, daily: days.map((date) => ({ date, spend: spendByDay.get(date) ?? 0, revenue: revByDay.get(date) ?? 0 })) };
}
