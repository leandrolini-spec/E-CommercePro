"use server";

import { revalidatePath } from "next/cache";
import { hasValidSession } from "@/core/session";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import { adAccountInfo } from "./client";
import { deleteAdAccount, saveAdAccount, syncAds } from "./sync";

type Result = void | { error: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Conecta la cuenta publicitaria de Meta en modo lectura: se comprueba con Meta antes de guardar y se trae el gasto de los últimos días. */
export async function connectMetaAds(fd: FormData): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (!isSupabase()) return { error: "En la demostración la cuenta publicitaria ya figura como conectada de ejemplo." };
  const id = str(fd, "adAccountId").replace(/^act_/, ""), token = str(fd, "token");
  if (!/^\d{5,25}$/.test(id)) return { error: "El identificador de la cuenta publicitaria son solo dígitos (lo ves en el Administrador de Anuncios)." };
  if (token.length < 20) return { error: "Pegá el token de acceso completo." };
  try { await adAccountInfo(token, id); } catch (e) { return { error: `Meta no aceptó esos datos: ${(e as Error).message}` }; }
  const projectId = await activeProjectId();
  await saveAdAccount(projectId, id, token);
  try { await syncAds(projectId); } catch { /* el primer traslado puede fallar: se reintenta solo con la tarea programada */ }
  revalidatePath("/anuncios"); revalidatePath("/");
}

export async function disconnectMetaAds(): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (isSupabase()) await deleteAdAccount(await activeProjectId());
  revalidatePath("/anuncios"); revalidatePath("/");
}

export async function syncMetaAdsNow(): Promise<Result> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  if (!isSupabase()) return;
  try { await syncAds(await activeProjectId()); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/anuncios");
}
