import { service } from "./repo/supabase";

/** Motivos de una venta caída. Se guardan como marcas en message_reads (clave "motivo:<venta>:<código>"): sin tablas nuevas. */
export const CANCEL_REASONS = [
  ["interior_envio", "Interior: no quiso pagar el envío"], ["logistica", "Problema de logística"], ["sin_stock", "Sin stock / no se pudo entregar"],
  ["arrepentido", "El comprador se arrepintió"], ["otro", "Otro motivo"],
] as const;
export const reasonLabel = (code?: string) => CANCEL_REASONS.find((r) => r[0] === code)?.[1] ?? "Sin clasificar";

export async function cancelReasons(projectId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await service().from("message_reads").select("key").eq("project_id", projectId).like("key", "motivo:%").limit(5000);
  for (const r of data ?? []) {
    const [, saleId, code] = String(r.key).split(":");
    if (saleId && code) out.set(saleId, code);
  }
  return out;
}
