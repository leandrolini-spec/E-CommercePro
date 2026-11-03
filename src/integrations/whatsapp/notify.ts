import { demoLogAdd } from "@/modules/demo/whatsapp";
import { addInboxMessage } from "@/modules/inbox";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import { seguimientoUrl } from "@/modules/seguimiento";
import { stagesOf } from "@/modules/shipments";
import type { Db, Shipment } from "@/modules/types";
import { fillTemplate, waPhone, type WaTemplate } from "@/modules/whatsapp";
import { getWaCreds, hasConsent, markWaError } from "./account";
import { waSendTemplate, WaError } from "./client";

const baseUrl = () => (process.env.APP_BASE_URL || "http://localhost:4850").replace(/\/$/, "");

/** Valor de cada variable de una plantilla para este envío. */
function valueOf(key: string, db: Db, x: Shipment): string {
  switch (key) {
    case "nombre": return x.customer.split(" ")[0] || "";
    case "negocio": return db.settings.name;
    case "producto": return x.items.slice(0, 80);
    case "seguimiento": return seguimientoUrl(baseUrl(), x.id);
    case "etapa": return stagesOf(db.settings).find((s) => s.id === x.stage)?.name ?? x.stage;
    default: return "";
  }
}

/**
 * Avisa al cliente por WhatsApp cuando un envío pasa a una etapa con aviso automático.
 * Nunca frena el cambio de etapa: si algo falla queda registrado y listo. Un mismo aviso no sale dos veces (clave por envío, etapa y plantilla).
 */
export async function notifyShipmentStage(db: Db, x: Shipment, stageId: string): Promise<void> {
  try {
    const cfg = db.settings.company?.whatsappApi;
    const auto = cfg?.automations?.find((a) => a.stage === stageId && a.enabled);
    if (!auto) return;
    const t: WaTemplate | undefined = cfg?.templates?.find((y) => y.id === auto.templateId);
    const skip = (reason: string) => (isSupabase() ? logOutbox(x, t?.name ?? "", "", "omitido", reason) : demoLogAdd({ to: x.phone || "—", template: t?.name ?? "—", body: "", status: "omitido", reason }));
    if (!t || t.status !== "APPROVED") return void (await skip("La plantilla no está aprobada por Meta."));
    if (!waPhone(x.phone)) return void (await skip("El envío no tiene teléfono."));
    const values = t.vars.map((v) => valueOf(v, db, x));
    const body = fillTemplate(t.body, values);
    if (!isSupabase()) { demoLogAdd({ to: x.phone, template: t.name, body, status: "enviado" }); return; }
    const projectId = await activeProjectId();
    const creds = await getWaCreds(projectId);
    if (!creds) return void (await skip("WhatsApp no está conectado."));
    const phone = waPhone(x.phone);
    if (!(await hasConsent(projectId, phone))) return void (await skip("El cliente no aceptó recibir mensajes (todavía no escribió al número)."));
    const key = `ship:${x.id}:${stageId}:${t.id}`;
    const { error: dup } = await service().from("whatsapp_outbox").insert({ project_id: projectId, idempotency_key: key, to_phone: phone, kind: "template", template_name: t.name, body, status: "queued" });
    if (dup) return; // ya se mandó (o se está mandando)
    try {
      const wamid = await waSendTemplate(creds, phone, { name: t.name, language: t.language }, values);
      await service().from("whatsapp_outbox").update({ status: "sent", wamid }).eq("project_id", projectId).eq("idempotency_key", key);
      await addInboxMessage(projectId, { channel: "whatsapp", kind: "mensaje", externalId: phone, phone: `+${phone}`, name: x.customer }, { id: wamid, direction: "out", body, at: new Date().toISOString(), meta: { status: "sent", template: t.name } }, { markUnread: false });
    } catch (e) {
      const err = e as WaError;
      await service().from("whatsapp_outbox").update({ status: "failed", error: err.message }).eq("project_id", projectId).eq("idempotency_key", key);
      if (err.expired) await markWaError(projectId, err.message, true);
    }
  } catch {
    // Un aviso que falla no puede romper el cambio de etapa.
  }
}

async function logOutbox(x: Shipment, template: string, body: string, status: string, reason: string) {
  try {
    const projectId = await activeProjectId();
    await service().from("whatsapp_outbox").insert({ project_id: projectId, idempotency_key: `skip:${x.id}:${Date.now()}`, to_phone: waPhone(x.phone) || "—", kind: "template", template_name: template, body, status, error: reason });
  } catch { /* sin registro */ }
}
