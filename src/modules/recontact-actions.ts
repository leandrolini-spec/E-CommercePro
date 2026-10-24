"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { today } from "@/lib/format";
import { activeProjectId, isSupabase, service } from "./repo/supabase";

/** Anota que ya se le escribió a este cliente: sale de la lista por 30 días. */
export async function markRecontacted(customerId: string): Promise<void> {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  if (!isSupabase()) return;
  await service().from("message_reads").upsert({ project_id: await activeProjectId(), key: `recontacto:${customerId}:${today()}` }, { onConflict: "project_id,key" });
  revalidatePath("/recontacto");
}
