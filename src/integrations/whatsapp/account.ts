import { decrypt, encrypt } from "@/core/crypto";
import { service } from "@/core/db-client";
import type { WaCreds } from "./client";

/** Cuenta de WhatsApp de la empresa (la API oficial de Meta), con el token ya descifrado. Null si no está conectada. */
export async function getWaCreds(projectId: string): Promise<WaCreds | null> {
  const { data, error } = await service().from("whatsapp_accounts").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data || data.status === "disconnected") return null;
  return { projectId, phoneNumberId: data.phone_number_id, wabaId: data.waba_id, token: decrypt(data.token_enc), displayPhone: data.display_phone ?? undefined };
}

export type WaAccountStatus = { connected: boolean; display?: string; status?: string; error?: string; since?: string };

export async function waAccountStatus(projectId: string): Promise<WaAccountStatus> {
  const { data } = await service().from("whatsapp_accounts").select("display_phone,status,last_error,connected_at").eq("project_id", projectId).maybeSingle();
  if (!data || data.status === "disconnected") return { connected: false };
  return { connected: data.status === "connected", display: data.display_phone ?? undefined, status: data.status, error: data.last_error ?? undefined, since: data.connected_at };
}

/** Guarda la cuenta (token cifrado) y la registra para que los mensajes que entran se asignen a esta empresa. */
export async function saveWaAccount(projectId: string, a: { phoneNumberId: string; wabaId: string; token: string; displayPhone?: string }) {
  const sb = service();
  const { error } = await sb.from("whatsapp_accounts").upsert({
    project_id: projectId, phone_number_id: a.phoneNumberId, waba_id: a.wabaId, display_phone: a.displayPhone ?? null,
    token_enc: encrypt(a.token), status: "connected", last_error: null, connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(`No se pudo guardar la cuenta de WhatsApp: ${error.message}`);
  const { error: e2 } = await sb.from("channel_accounts").upsert({ channel: "whatsapp", external_id: a.phoneNumberId, project_id: projectId });
  if (e2) throw new Error(`No se pudo registrar el número: ${e2.message}`);
}

export async function deleteWaAccount(projectId: string) {
  const sb = service();
  const { data } = await sb.from("whatsapp_accounts").select("phone_number_id").eq("project_id", projectId).maybeSingle();
  await sb.from("whatsapp_accounts").delete().eq("project_id", projectId);
  if (data?.phone_number_id) await sb.from("channel_accounts").delete().eq("channel", "whatsapp").eq("external_id", data.phone_number_id);
}

/** Anota que el token venció o falló, para mostrar "Reconectá WhatsApp". */
export async function markWaError(projectId: string, message: string, expired: boolean) {
  await service().from("whatsapp_accounts").update({ last_error: message, ...(expired ? { status: "expired" } : {}) }).eq("project_id", projectId);
}

/** Consentimiento: quien escribe al número acepta recibir respuestas y avisos; "BAJA" lo quita. */
export async function setConsent(projectId: string, phone: string, optedIn: boolean, source: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return;
  await service().from("whatsapp_consents").upsert({ project_id: projectId, phone: digits, opted_in: optedIn, source, updated_at: new Date().toISOString() });
}

export async function hasConsent(projectId: string, phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const { data } = await service().from("whatsapp_consents").select("opted_in").eq("project_id", projectId).eq("phone", digits).maybeSingle();
  return data?.opted_in === true;
}
