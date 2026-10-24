import { service } from "./repo/supabase";

/** Bandeja de mensajes: cada conversación (hilo) pertenece a un canal. Mercado Libre se arma aparte desde lo que ya se guarda de ML. */
export type InboxChannel = "tiendanube" | "mercadolibre" | "whatsapp" | "instagram";

export type ThreadInput = {
  channel: InboxChannel; kind: string; externalId: string; customerId?: string | null;
  name?: string; phone?: string; email?: string; handle?: string; subject?: string; link?: string;
};
export type MessageInput = { id: string; direction: "in" | "out"; body: string; at: string; meta?: Record<string, unknown> };

export const threadId = (channel: string, externalId: string) => `${channel}:${externalId}`;

const digits = (s: string) => s.replace(/\D/g, "");

/** Cliente del CRM con ese teléfono (compara los últimos 10 dígitos). */
export async function customerByPhone(projectId: string, phone: string): Promise<string | null> {
  const key = digits(phone).slice(-10);
  if (key.length < 8) return null;
  const { data } = await service().from("customers").select("id,phone").eq("project_id", projectId).neq("phone", "");
  return (data ?? []).find((c) => digits(String(c.phone)).slice(-10) === key)?.id ?? null;
}

/**
 * Guarda un mensaje en su conversación (la crea si no existe). Un mensaje ya guardado no se repite ni vuelve a quedar "sin leer".
 * `markUnread` en false sirve para el historial viejo que se importa de golpe.
 */
export async function addInboxMessage(projectId: string, t: ThreadInput, m: MessageInput, opts: { markUnread?: boolean } = {}): Promise<boolean> {
  const sb = service();
  const id = threadId(t.channel, t.externalId);
  const mid = `${id}:${m.id}`;
  const { data: have } = await sb.from("inbox_messages").select("id").eq("id", mid).maybeSingle();
  if (have) return false;

  const { data: cur } = await sb.from("inbox_threads").select("*").eq("id", id).maybeSingle();
  const at = new Date(m.at).toISOString();
  const newer = !cur || at >= new Date(cur.last_at).toISOString();
  const row = {
    id, project_id: projectId, channel: t.channel, kind: t.kind, external_id: t.externalId,
    customer_id: t.customerId ?? cur?.customer_id ?? null,
    contact_name: t.name || cur?.contact_name || "", contact_phone: t.phone || cur?.contact_phone || "", contact_email: t.email || cur?.contact_email || "",
    contact_handle: t.handle || cur?.contact_handle || "", subject: t.subject || cur?.subject || "", link: t.link || cur?.link || "",
    last_message: newer ? m.body.slice(0, 400) : cur!.last_message, last_at: newer ? at : cur!.last_at,
    unread: m.direction === "in" ? (opts.markUnread ?? true) || Boolean(cur?.unread) : (cur?.unread ?? false),
    // Un mensaje nuevo del cliente reabre una conversación que estaba resuelta.
    status: m.direction === "in" && (opts.markUnread ?? true) ? "abierto" : (cur?.status ?? "abierto"),
  };
  const { error } = await sb.from("inbox_threads").upsert(row);
  if (error) throw new Error(`No se pudo guardar la conversación: ${error.message}`);
  const { error: e2 } = await sb.from("inbox_messages").insert({ id: mid, project_id: projectId, thread_id: id, direction: m.direction, body: m.body, at, meta: m.meta ?? {} });
  if (e2 && e2.code !== "23505") throw new Error(`No se pudo guardar el mensaje: ${e2.message}`);
  return true;
}

export type ThreadRow = {
  id: string; channel: InboxChannel; kind: string; customer_id: string | null; contact_name: string; contact_phone: string; contact_email: string;
  contact_handle: string; subject: string; last_message: string; last_at: string; unread: boolean; status: "abierto" | "resuelto"; link: string;
};

export async function listThreads(projectId: string, limit = 300): Promise<ThreadRow[]> {
  const { data, error } = await service().from("inbox_threads").select("*").eq("project_id", projectId).order("last_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`No se pudo leer la bandeja: ${error.message}`);
  return (data ?? []) as ThreadRow[];
}

export async function threadMessages(projectId: string, id: string) {
  const { data } = await service().from("inbox_messages").select("id,direction,body,at").eq("project_id", projectId).eq("thread_id", id).order("at", { ascending: true }).limit(200);
  return (data ?? []) as { id: string; direction: "in" | "out"; body: string; at: string }[];
}
