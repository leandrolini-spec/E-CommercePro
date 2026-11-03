import { waPhone } from "@/modules/whatsapp";

/** Cliente de la API oficial de WhatsApp (Meta Cloud API). La versión de la API se puede cambiar con META_GRAPH_VERSION sin tocar el código. */
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v23.0"}`;

export type WaCreds = { projectId: string; phoneNumberId: string; wabaId: string; token: string; displayPhone?: string };

/** Errores de Meta traducidos a algo que entienda el negocio. */
export class WaError extends Error {
  constructor(message: string, readonly code?: number, readonly expired = false) { super(message); }
}

type MetaErr = { error?: { message?: string; code?: number; error_data?: { details?: string } } };
function explain(body: MetaErr, status: number): WaError {
  const code = body.error?.code;
  const raw = body.error?.error_data?.details || body.error?.message || `Error ${status}`;
  switch (code) {
    case 131047: return new WaError("Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede escribir con una plantilla.", code);
    case 131026: return new WaError("Ese número no puede recibir el mensaje (no tiene WhatsApp o lo bloqueó).", code);
    case 190: return new WaError("El acceso de WhatsApp venció o se revocó: reconectalo desde WhatsApp.", code, true);
    case 132001: return new WaError("La plantilla no existe o todavía no está aprobada por Meta.", code);
    case 132000: return new WaError("La plantilla necesita otra cantidad de variables.", code);
    case 130429: case 131056: return new WaError("Meta limitó los envíos por ahora: probá de nuevo en unos minutos.", code);
    default: return new WaError(raw, code);
  }
}

async function call<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & MetaErr;
  if (!res.ok || (body as MetaErr).error) throw explain(body as MetaErr, res.status);
  return body;
}

/** Comprueba que el token y el número sirven y devuelve el número visible. */
export async function waVerify(c: Pick<WaCreds, "phoneNumberId" | "token">): Promise<{ display: string; name: string }> {
  const r = await call<{ display_phone_number?: string; verified_name?: string }>(c.token, `/${c.phoneNumberId}?fields=display_phone_number,verified_name`);
  return { display: r.display_phone_number ?? "", name: r.verified_name ?? "" };
}

/** Texto libre (solo dentro de las 24 horas del último mensaje del cliente). Devuelve el id del mensaje. */
export async function waSendText(c: WaCreds, to: string, body: string): Promise<string> {
  const r = await call<{ messages?: { id: string }[] }>(c.token, `/${c.phoneNumberId}/messages`, {
    method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", to: waPhone(to), type: "text", text: { body, preview_url: true } }),
  });
  return r.messages?.[0]?.id ?? "";
}

/** Plantilla aprobada, con sus variables en orden. */
export async function waSendTemplate(c: WaCreds, to: string, t: { name: string; language: string }, values: string[]): Promise<string> {
  const r = await call<{ messages?: { id: string }[] }>(c.token, `/${c.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", to: waPhone(to), type: "template",
      template: { name: t.name, language: { code: t.language }, components: values.length ? [{ type: "body", parameters: values.map((v) => ({ type: "text", text: v })) }] : [] },
    }),
  });
  return r.messages?.[0]?.id ?? "";
}

/** Manda una plantilla nueva a revisión de Meta. */
export async function waCreateTemplate(c: WaCreds, t: { name: string; category: "UTILITY" | "MARKETING"; language: string; body: string; examples: string[] }): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = { type: "BODY", text: t.body };
  if (t.examples.length) body.example = { body_text: [t.examples] };
  const r = await call<{ id: string; status?: string }>(c.token, `/${c.wabaId}/message_templates`, {
    method: "POST", body: JSON.stringify({ name: t.name, category: t.category, language: t.language, components: [body] }),
  });
  return { id: r.id, status: r.status ?? "PENDING" };
}

/** Estado actual de las plantillas de la cuenta (para actualizar las aprobadas y las rechazadas). */
export async function waTemplateStates(c: WaCreds): Promise<{ name: string; language: string; status: string; reason?: string }[]> {
  const r = await call<{ data?: { name: string; language: string; status: string; rejected_reason?: string }[] }>(c.token, `/${c.wabaId}/message_templates?fields=name,language,status,rejected_reason&limit=200`);
  return (r.data ?? []).map((x) => ({ name: x.name, language: x.language, status: x.status, reason: x.rejected_reason && x.rejected_reason !== "NONE" ? x.rejected_reason : undefined }));
}

/** Marca como leído un mensaje recibido (le muestra el doble tilde azul al cliente). */
export async function waMarkRead(c: WaCreds, wamid: string): Promise<void> {
  await call(c.token, `/${c.phoneNumberId}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }) });
}
