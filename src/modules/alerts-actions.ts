"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { getDb, persist } from "./data";
import { sendPhoneAlert } from "./alerts";
import { activeProjectId, isSupabase } from "./repo/supabase";

const newTopic = () => `crm-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/** Enciende o apaga los avisos al celular y guarda el tema (si no hay, se genera uno difícil de adivinar). */
export async function saveAlerts(fd: FormData): Promise<void | { error: string }> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const enabled = String(fd.get("enabled") ?? "") === "si";
  let topic = String(fd.get("topic") ?? "").trim();
  if (!topic) topic = newTopic();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(topic)) return { error: "El tema solo puede tener letras, números, guiones y guion bajo (8 a 64 caracteres)." };
  const db = await getDb();
  (db.settings.company ??= {}).alerts = { enabled, ntfyTopic: topic };
  await persist(db);
  revalidatePath("/mensajes");
}

/** Guarda y manda un aviso de prueba al celular. */
export async function saveAndTestAlerts(fd: FormData): Promise<void | { error: string }> {
  const saved = await saveAlerts(fd);
  if (saved && "error" in saved) return saved;
  if (!isSupabase()) return { error: "Los avisos funcionan con la base real (no en modo de prueba local)." };
  if (String(fd.get("enabled") ?? "") !== "si") return { error: "Los avisos están apagados: elegí “Activados” para probarlos." };
  const ok = await sendPhoneAlert(await activeProjectId(), { title: "CRM · Prueba", message: "Si ves este aviso, el celular del negocio ya recibe las notificaciones.", priority: 3 });
  if (!ok) return { error: "Se guardó, pero no se pudo mandar el aviso de prueba. Probá de nuevo en un momento." };
}
