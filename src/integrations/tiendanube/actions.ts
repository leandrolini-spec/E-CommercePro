"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { hasValidSession } from "@/core/session";
import { activeProjectId, service } from "@/modules/repo/supabase";
import { api, registerWebhooks, syncAll, syncOne } from "./sync";

const refresh = () => { for (const path of ["/tiendanube", "/productos", "/stock", "/ventas", "/envios", "/clientes", "/"]) revalidatePath(path); };

/** Botón "Sincronizar ahora": trae productos y pedidos nuevos o modificados, y deja registrados los avisos en vivo. */
export async function syncTnNow() {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await syncAll(projectId, { maxMs: 50_000 });
  const base = process.env.APP_BASE_URL;
  if (base) after(() => registerWebhooks(projectId, base).catch(() => {}));
  refresh();
}

/** Recarga todo el historial de pedidos desde cero (solo para casos excepcionales). */
export async function reloadTnAll() {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await syncAll(projectId, { full: true, maxMs: 55_000 });
  refresh();
}

/** Envía a Tienda Nube el estado, precio o stock de un producto y actualiza lo guardado en el CRM. Solo lo que realmente cambió. */
export async function updateTnProduct(tnProductId: string, fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  if (!/^\d+$/.test(tnProductId)) throw new Error("Producto no válido.");
  const projectId = await activeProjectId();
  const price = String(fd.get("price") ?? "").trim(), stock = String(fd.get("stock") ?? "").trim(), status = String(fd.get("status") ?? "").trim();

  const { data: cur } = await service().from("tn_resources").select("data").eq("project_id", projectId).eq("kind", "product").eq("tn_id", tnProductId).maybeSingle();
  const p = (cur?.data ?? {}) as { published?: boolean; variants?: { id: number; price: string; stock: number | null }[] };
  const variants = p.variants ?? [];
  let changed = false;

  if (status === "paused" || status === "active") {
    const want = status === "active";
    if ((p.published !== false) !== want) { await api(projectId, `/products/${tnProductId}`, { method: "PUT", body: { published: want } }); changed = true; }
  }
  if (price || stock) {
    if (variants.length !== 1) throw new Error("Este producto tiene variantes: cambiá el precio y el stock directamente en Tienda Nube.");
    const v = variants[0], body: Record<string, unknown> = {};
    if (price) { const n = Number(price); if (!(n > 0)) throw new Error("El precio debe ser mayor a cero."); if (n !== Number(v.price)) body.price = n; }
    if (stock) { const n = Number(stock); if (!Number.isInteger(n) || n < 0) throw new Error("El stock debe ser un número entero, 0 o más."); if (n !== v.stock) body.stock = n; }
    if (Object.keys(body).length) { await api(projectId, `/products/${tnProductId}/variants/${v.id}`, { method: "PUT", body }); changed = true; }
  }
  if (!changed) throw new Error("No cambiaste nada.");
  await syncOne(projectId, "product", tnProductId).catch(() => {});
  refresh();
}
