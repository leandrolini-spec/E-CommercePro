import { service } from "./repo/supabase";

/** Claves de los mensajes y preguntas de Mercado Libre que ya se marcaron como leídos desde el CRM (Mercado Libre no deja marcarlos desde acá). */
export const mlMsgKey = (orderId: string, lastMsgId: string) => `ml:m:${orderId}:${lastMsgId}`;
export const mlQuestionKey = (id: string) => `ml:q:${id}`;

export async function readKeys(projectId: string): Promise<Set<string>> {
  const { data } = await service().from("message_reads").select("key").eq("project_id", projectId).limit(5000);
  return new Set((data ?? []).map((r) => String(r.key)));
}

export async function markKeysRead(projectId: string, keys: string[]) {
  if (!keys.length) return;
  await service().from("message_reads").upsert(keys.map((key) => ({ project_id: projectId, key })), { onConflict: "project_id,key" });
}

/** Clave de "resuelto": la charla ya no pide respuesta (se marcó a mano). */
export const doneKey = (key: string) => `done:${key}`;

/** Mensajes de cortesía del comprador ("gracias", "perfecto", "ok"…): no hace falta contestarlos, no se cuentan como pendientes. */
export const isCourtesy = (text: string) => {
  const t = text.trim();
  return t.length <= 40 && /^(hola[,!\s]+)?(ok|okey|dale|perfecto|perfecta|gracias|muchas gracias|mil gracias|genial|buen[ií]simo|listo|joya|excelente|de nada|todo bien|bien|barbaro|bárbaro|gracias!+)[\s!.,)]*$/i.test(t);
};
