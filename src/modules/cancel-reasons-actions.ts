"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { CANCEL_REASONS } from "./cancel-reasons";
import { activeProjectId, isSupabase, service } from "./repo/supabase";

/** Anota el motivo por el que se cayó una venta (o lo borra si se elige "Sin clasificar"). */
export async function setCancelReason(saleId: string, fd: FormData): Promise<void> {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  if (!isSupabase()) return;
  const code = String(fd.get("reason") ?? "");
  const projectId = await activeProjectId();
  const sb = service();
  await sb.from("message_reads").delete().eq("project_id", projectId).like("key", `motivo:${saleId}:%`);
  if (CANCEL_REASONS.some((r) => r[0] === code)) await sb.from("message_reads").upsert({ project_id: projectId, key: `motivo:${saleId}:${code}` }, { onConflict: "project_id,key" });
  for (const path of ["/ventas", "/reportes"]) revalidatePath(path);
}
