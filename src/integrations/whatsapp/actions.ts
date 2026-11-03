"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { persist, getDb } from "@/modules/data";
import { demoReply, demoThreads } from "@/modules/demo/whatsapp";
import { addInboxMessage, threadMessages } from "@/modules/inbox";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import { slugify } from "@/modules/shipments";
import { fillTemplate, windowLeft, WA_VARS, type WaAutomation, type WaTemplate } from "@/modules/whatsapp";
import { waContext } from "./context";
import { deleteWaAccount, getWaCreds, markWaError, saveWaAccount } from "./account";
import { waCreateTemplate, waSendText, waSendTemplate, waTemplateStates, waVerify, WaError } from "./client";

type Result = void | { error: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = () => { revalidatePath("/mensajes"); revalidatePath("/whatsapp"); };

/** Última vez que escribió el cliente en la conversación (para la ventana de 24 horas). */
async function lastInbound(threadId: string): Promise<string | undefined> {
  if (!isSupabase()) return demoThreads(await getDb()).find((t) => t.id === threadId)?.messages.filter((m) => !m.out).at(-1)?.at;
  const msgs = await threadMessages(await activeProjectId(), threadId);
  return [...msgs].reverse().find((m) => m.direction === "in")?.at;
}

/** Contesta con texto libre desde Mensajes (solo dentro de las 24 horas del último mensaje del cliente). */
export async function sendWhatsAppReply(threadId: string, fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const text = str(fd, "text");
  if (!text) return { error: "Escribí el mensaje." };
  if (text.length > 4000) return { error: "El mensaje es demasiado largo (máximo 4000 caracteres)." };
  if (!windowLeft(await lastInbound(threadId)).open) return { error: "Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede escribir con una plantilla." };
  if (!isSupabase()) { demoReply(threadId, text); done(); return; } // demostración: queda solo en pantalla
  const projectId = await activeProjectId();
  const creds = await getWaCreds(projectId);
  if (!creds) return { error: "WhatsApp no está conectado. Conectalo desde la sección WhatsApp." };
  const phone = threadId.replace(/^whatsapp:/, "");
  try {
    const wamid = await waSendText(creds, phone, text);
    await addInboxMessage(projectId, { channel: "whatsapp", kind: "mensaje", externalId: phone, phone: `+${phone}`, name: "" }, { id: wamid, direction: "out", body: text, at: new Date().toISOString(), meta: { status: "sent" } }, { markUnread: false });
    await service().from("whatsapp_outbox").insert({ project_id: projectId, idempotency_key: `reply:${wamid}`, thread_id: threadId, to_phone: phone, kind: "reply", body: text, wamid, status: "sent" });
  } catch (e) {
    const err = e as WaError;
    if (err.expired) await markWaError(projectId, err.message, true);
    return { error: err.message || "No se pudo enviar el mensaje." };
  }
  done();
}

/** Escribe con una plantilla aprobada (la única forma de hacerlo pasadas las 24 horas). Las variables se completan con los datos del cliente. */
export async function sendWhatsAppTemplate(threadId: string, fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const db = await getDb();
  const t = db.settings.company?.whatsappApi?.templates?.find((x) => x.id === str(fd, "templateId"));
  if (!t) return { error: "Elegí una plantilla." };
  if (t.status !== "APPROVED") return { error: "Esa plantilla todavía no está aprobada por Meta." };
  const thread = !isSupabase() ? demoThreads(db).find((x) => x.id === threadId) : undefined;
  const name = thread?.name ?? str(fd, "customerName");
  const ctx = waContext(db, threadId.replace(/^whatsapp:/, ""), name);
  const values = t.vars.map((v) => ctx[v] ?? "");
  const missing = t.vars.filter((v) => !ctx[v]);
  if (missing.length) return { error: `No se puede completar esta plantilla: faltan ${missing.map((v) => `[${v}]`).join(", ")} de este cliente. Elegí otra plantilla.` };
  const body = fillTemplate(t.body, values);
  if (!isSupabase()) { demoReply(threadId, body, t.name); done(); return; }
  const projectId = await activeProjectId();
  const creds = await getWaCreds(projectId);
  if (!creds) return { error: "WhatsApp no está conectado." };
  const phone = threadId.replace(/^whatsapp:/, "");
  try {
    const wamid = await waSendTemplate(creds, phone, { name: t.name, language: t.language }, values);
    await addInboxMessage(projectId, { channel: "whatsapp", kind: "mensaje", externalId: phone, phone: `+${phone}`, name }, { id: wamid, direction: "out", body, at: new Date().toISOString(), meta: { status: "sent", template: t.name } }, { markUnread: false });
    await service().from("whatsapp_outbox").insert({ project_id: projectId, idempotency_key: `reply:${wamid}`, thread_id: threadId, to_phone: phone, kind: "template", template_name: t.name, body, wamid, status: "sent" });
  } catch (e) {
    const err = e as WaError;
    if (err.expired) await markWaError(projectId, err.message, true);
    return { error: err.message || "No se pudo enviar la plantilla." };
  }
  done();
}

/** Conecta el número de WhatsApp del negocio: se comprueba con Meta antes de guardar (el token se guarda cifrado). */
export async function connectWhatsApp(fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (!isSupabase()) return { error: "En la demostración WhatsApp ya figura como conectado de ejemplo." };
  const phoneNumberId = str(fd, "phoneNumberId"), wabaId = str(fd, "wabaId"), token = str(fd, "token");
  if (!/^\d{5,25}$/.test(phoneNumberId)) return { error: "El identificador del número son solo dígitos (lo ves en Meta → WhatsApp → Configuración de la API)." };
  if (!/^\d{5,25}$/.test(wabaId)) return { error: "El identificador de la cuenta de WhatsApp Business son solo dígitos." };
  if (token.length < 20) return { error: "Pegá el token de acceso completo." };
  let display = "";
  try { display = (await waVerify({ phoneNumberId, token })).display; } catch (e) { return { error: `Meta no aceptó esos datos: ${(e as Error).message}` }; }
  await saveWaAccount(await activeProjectId(), { phoneNumberId, wabaId, token, displayPhone: display });
  done();
}

export async function disconnectWhatsApp(): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (isSupabase()) await deleteWaAccount(await activeProjectId());
  done();
}

/** El texto de la plantilla se escribe con [nombre], [producto]… y se convierte en las variables numeradas que pide Meta. */
function toMetaBody(text: string): { body: string; vars: string[] } | { error: string } {
  const vars: string[] = [];
  const known = new Set(WA_VARS.map((v) => v.key));
  const body = text.replace(/\[([a-z]+)\]/g, (m, k: string) => {
    if (!known.has(k)) return m;
    let i = vars.indexOf(k);
    if (i < 0) { vars.push(k); i = vars.length - 1; }
    return `{{${i + 1}}}`;
  });
  if (/\[[^\]]+\]/.test(body)) return { error: `Hay una variable que no existe. Las disponibles son: ${WA_VARS.map((v) => `[${v.key}]`).join(", ")}.` };
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}[\s.!?¡¿]*$/.test(body)) return { error: "Meta no permite que el texto empiece ni termine con una variable: sumale una palabra antes y después." };
  return { body, vars };
}

/** Crea una plantilla: cada negocio escribe las suyas. En la versión real se manda a revisión de Meta. */
export async function saveWaTemplate(fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const name = slugify(str(fd, "name")).slice(0, 60);
  if (name.length < 3) return { error: "Poné un nombre de al menos 3 letras." };
  const text = str(fd, "body");
  if (text.length < 10) return { error: "El texto es muy corto." };
  if (text.length > 1024) return { error: "El texto es demasiado largo (máximo 1024 caracteres)." };
  const conv = toMetaBody(text);
  if ("error" in conv) return conv;
  const category = str(fd, "category") === "MARKETING" ? "MARKETING" : "UTILITY";
  const db = await getDb();
  const cfg = db.settings.company?.whatsappApi ?? {};
  if ((cfg.templates ?? []).some((t) => t.name === name)) return { error: "Ya tenés una plantilla con ese nombre." };
  let status: WaTemplate["status"] = "PENDING";
  if (isSupabase()) {
    const creds = await getWaCreds(await activeProjectId());
    if (!creds) return { error: "Conectá WhatsApp antes de crear plantillas: Meta las tiene que revisar." };
    try {
      const r = await waCreateTemplate(creds, { name, category, language: "es_AR", body: conv.body, examples: conv.vars.map((v) => WA_VARS.find((x) => x.key === v)?.example ?? v) });
      status = r.status === "APPROVED" ? "APPROVED" : "PENDING";
    } catch (e) { return { error: (e as Error).message }; }
  }
  const t: WaTemplate = { id: `t${Date.now()}`, name, category, language: "es_AR", status, body: conv.body, vars: conv.vars, createdAt: new Date().toISOString() };
  db.settings.company = { ...db.settings.company, whatsappApi: { ...cfg, templates: [...(cfg.templates ?? []), t] } };
  await persist(db);
  done();
}

export async function deleteWaTemplate(id: string): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const db = await getDb();
  const cfg = db.settings.company?.whatsappApi ?? {};
  db.settings.company = { ...db.settings.company, whatsappApi: { ...cfg, templates: (cfg.templates ?? []).filter((t) => t.id !== id), automations: (cfg.automations ?? []).filter((a) => a.templateId !== id) } };
  await persist(db);
  done();
}

/** Demostración: simula que Meta aprobó una plantilla. En la versión real el estado lo informa Meta. */
export async function approveDemoTemplate(id: string): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (isSupabase()) return { error: "Solo disponible en la demostración." };
  const db = await getDb();
  const cfg = db.settings.company?.whatsappApi ?? {};
  db.settings.company = { ...db.settings.company, whatsappApi: { ...cfg, templates: (cfg.templates ?? []).map((t) => (t.id === id ? { ...t, status: "APPROVED" as const } : t)) } };
  await persist(db);
  done();
}

/** Trae de Meta el estado actual de las plantillas (aprobada, en revisión o rechazada). */
export async function refreshWaTemplates(): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (!isSupabase()) return;
  const creds = await getWaCreds(await activeProjectId());
  if (!creds) return { error: "WhatsApp no está conectado." };
  let states;
  try { states = await waTemplateStates(creds); } catch (e) { return { error: (e as Error).message }; }
  const db = await getDb();
  const cfg = db.settings.company?.whatsappApi ?? {};
  const templates = (cfg.templates ?? []).map((t) => {
    const s = states.find((x) => x.name === t.name && x.language === t.language);
    return s ? { ...t, status: (s.status === "APPROVED" ? "APPROVED" : s.status === "REJECTED" ? "REJECTED" : "PENDING") as WaTemplate["status"], reason: s.reason } : t;
  });
  db.settings.company = { ...db.settings.company, whatsappApi: { ...cfg, templates } };
  await persist(db);
  done();
}

/** Avisos automáticos: por cada etapa de envío, si está activo y con qué plantilla. */
export async function saveWaAutomations(fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const db = await getDb();
  const cfg = db.settings.company?.whatsappApi ?? {};
  const automations: WaAutomation[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^tpl_(.+)$/.exec(k);
    if (!m || !String(v)) continue;
    automations.push({ stage: m[1], templateId: String(v), enabled: fd.get(`on_${m[1]}`) === "on" });
  }
  db.settings.company = { ...db.settings.company, whatsappApi: { ...cfg, automations } };
  await persist(db);
  done();
}

