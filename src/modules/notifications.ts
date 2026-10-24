import { fdate, int, isoDaysAgo, money } from "@/lib/format";
import { saleTotals } from "./calc";
import { isCourtesy } from "./message-reads";
import { stagesOf } from "./shipments";
import type { Db } from "./types";

export type NotifType = "venta" | "mensaje" | "pregunta" | "envio" | "reembolso";
export type Notif = { id: string; type: NotifType; title: string; detail: string; href: string; at: string };

type Msg = { id: string; orderId: string; fromId: string; text: string; date: string; fromBuyer: boolean };
type Question = { id: string; text: string; status: string; created: string };

/**
 * Avisos de la campanita. Cada aviso tiene un id estable: cuando algo cambia (un mensaje nuevo, un envío que pasa de etapa) el id
 * cambia y vuelve a figurar como nuevo.
 */
export type InboxNotice = { id: string; channel: string; kind: string; name: string; subject: string; text: string; at: string };

export function buildNotifications(db: Db, ml: { messages: Msg[]; questions: Question[] } | null, inbox: InboxNotice[] = [], reads: Set<string> = new Set()): Notif[] {
  const out: Notif[] = [];
  const nameOf = (customerId: string) => db.customers.find((c) => c.id === customerId)?.name ?? "";
  const productName = (id: string) => db.products.find((p) => p.id === id)?.name ?? "Producto";

  // Ventas de los últimos 7 días.
  const since = isoDaysAgo(7);
  for (const s of db.sales) {
    if (s.status === "cancelada" || s.date < since) continue;
    const t = saleTotals(db, s);
    out.push({
      id: `sale:${s.id}`, type: "venta", at: s.date, href: "/ventas",
      title: `Nueva venta V-${s.number} · ${money(t.revenue)}`,
      detail: [s.channel, nameOf(s.customerId), s.items.map((i) => `${i.qty} × ${productName(i.productId)}`).join(" · ")].filter(Boolean).join(" · "),
    });
  }

  // Ventas que se cayeron y hubo que devolver la plata (últimos 30 días): hay que reembolsar si todavía no se hizo.
  const sinceRefund = isoDaysAgo(30);
  for (const s of db.sales) {
    // Solo las que el sistema vio caerse (con fecha de reembolso): las canceladas de antes no vuelven a avisar.
    if (!(s.status === "cancelada" || s.payStatus === "reembolsada") || !s.refundedAt || s.refundDoneAt) continue;
    const at = s.refundedAt;
    if (at < sinceRefund) continue;
    const t = saleTotals({ ...db, sales: [{ ...s, status: "pendiente" }] }, { ...s, status: "pendiente" });
    out.push({
      id: `refund:${s.id}`, type: "reembolso", at, href: "/ventas?tab=reembolsar",
      title: `Venta cancelada V-${s.number} · reembolsar ${money(t.revenue)}`,
      detail: [s.channel, nameOf(s.customerId), s.items.map((i) => `${i.qty} × ${productName(i.productId)}`).join(" · ")].filter(Boolean).join(" · "),
    });
  }

  if (ml) {
    // Mensajes: conversaciones donde el último mensaje es del comprador (te toca responder).
    const byOrder = new Map<string, Msg[]>();
    for (const m of ml.messages) if (m.orderId) byOrder.set(m.orderId, [...(byOrder.get(m.orderId) ?? []), m]);
    for (const [orderId, list] of byOrder) {
      const last = [...list].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
      if (!last.fromBuyer || last.date.slice(0, 10) < isoDaysAgo(14) || reads.has(`ml:m:${orderId}:${last.id}`) || reads.has(`done:ml:m:${orderId}:${last.id}`) || isCourtesy(last.text)) continue;
      const buyer = db.customers.find((c) => c.id === `mlb_${last.fromId}`)?.name ?? `Comprador ${last.fromId}`;
      out.push({ id: `msg:${orderId}:${last.id}`, type: "mensaje", at: last.date, href: `/mensajes?hilo=${encodeURIComponent(`ml:m:${orderId}`)}`, title: `Mensaje de ${buyer}`, detail: last.text.trim() || "(mensaje vacío o adjunto)" });
    }
    // Preguntas sin responder.
    for (const q of ml.questions.filter((x) => x.status === "UNANSWERED" && !reads.has(`ml:q:${x.id}`) && !reads.has(`done:ml:q:${x.id}`)).slice(0, 30))
      out.push({ id: `q:${q.id}`, type: "pregunta", at: q.created, href: `/mensajes?hilo=${encodeURIComponent(`ml:q:${q.id}`)}`, title: "Pregunta sin responder", detail: q.text });
  }

  // Mensajes de la bandeja (Tienda Nube, WhatsApp, Instagram) sin leer.
  const CH: Record<string, string> = { tiendanube: "Tienda Nube", whatsapp: "WhatsApp", instagram: "Instagram" };
  for (const t of inbox)
    out.push({ id: `inbox:${t.id}:${t.at}`, type: "mensaje", at: t.at, href: `/mensajes?hilo=${encodeURIComponent(t.id)}`, title: `${CH[t.channel] ?? t.channel}: ${t.kind === "carrito" ? "carrito abandonado de" : t.kind === "nota" ? "nota de" : "mensaje de"} ${t.name || "cliente"}`, detail: t.text });

  // Envíos: pedidos nuevos y cada cambio de etapa.
  const stages = stagesOf(db.settings);
  const recent = isoDaysAgo(14);
  for (const x of db.shipments ?? []) {
    const finished = ["entregado", "volvio"].includes(x.stage);
    if (finished && x.createdAt < recent && (x.deliveredAt ?? "") < recent) continue;
    const stageName = stages.find((s) => s.id === x.stage)?.name ?? x.stage;
    const who = x.customer || db.customers.find((c) => c.id === db.sales.find((s) => s.id === x.saleId)?.customerId)?.name || "Cliente sin cargar";
    out.push({
      id: `ship:${x.id}:${x.stage}`, type: "envio", at: x.deliveredAt ?? x.dispatchedAt ?? x.createdAt, href: "/envios",
      title: x.stage === stages[0]?.id ? `Nuevo pedido: ${who}` : `Envío ${stageName.toLowerCase()}: ${who}`,
      detail: [x.items, [x.address, x.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || `Etapa: ${stageName}`,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, 80);
}

export const labelDay = (iso: string) => (iso.slice(0, 10) === isoDaysAgo(0) ? "Hoy" : iso.slice(0, 10) === isoDaysAgo(1) ? "Ayer" : fdate(iso));
export const countLabel = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;
