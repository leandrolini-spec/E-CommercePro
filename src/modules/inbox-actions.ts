"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { markKeysRead } from "./message-reads";
import { activeProjectId, service } from "./repo/supabase";

type State = "leido" | "resuelto" | "abierto";

/** Marca una conversación como leída, resuelta o la vuelve a abrir. */
export async function setThreadState(id: string, state: State) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const patch = state === "leido" ? { unread: false } : state === "resuelto" ? { unread: false, status: "resuelto" } : { status: "abierto" };
  const { error } = await service().from("inbox_threads").update(patch).eq("project_id", await activeProjectId()).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/mensajes");
  revalidatePath("/");
}

/** Marca como leído un mensaje o pregunta de Mercado Libre (por su clave). */
export async function markMlRead(key: string) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  await markKeysRead(await activeProjectId(), [key]);
  revalidatePath("/mensajes");
  revalidatePath("/");
}

/** Marca como leídas todas las conversaciones sin leer, también las de Mercado Libre (las claves las manda la pantalla). */
export async function markAllRead(mlKeys: string[] = []) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await service().from("inbox_threads").update({ unread: false }).eq("project_id", projectId).eq("unread", true);
  await markKeysRead(projectId, mlKeys.filter((k) => k.startsWith("ml:")).slice(0, 500));
  revalidatePath("/mensajes");
  revalidatePath("/");
}
