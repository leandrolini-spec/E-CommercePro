import { service } from "@/modules/repo/supabase";

export type TnLive = { tnId: string; stock: number | null; variants: number; published: boolean };

/** Lo último que informó Tienda Nube de cada producto, indexado por el producto del CRM (stock real en la tienda, para compararlo). */
export async function tnLiveByProduct(projectId: string): Promise<Map<string, TnLive>> {
  const sb = service();
  const [{ data: links }, { data: res }] = await Promise.all([
    sb.from("tn_item_links").select("tn_product_id,product_id").eq("project_id", projectId),
    sb.from("tn_resources").select("tn_id,data").eq("project_id", projectId).eq("kind", "product"),
  ]);
  const raw = new Map((res ?? []).map((r) => [String(r.tn_id), r.data as Record<string, any>])); // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Map<string, TnLive>();
  for (const l of links ?? []) {
    const p = raw.get(String(l.tn_product_id));
    if (!p) continue;
    const vs = (p.variants ?? []) as { stock: number | null }[];
    const unlimited = vs.some((v) => v.stock === null || v.stock === undefined);
    out.set(String(l.product_id), { tnId: String(l.tn_product_id), stock: unlimited ? null : vs.reduce((s, v) => s + Number(v.stock ?? 0), 0), variants: vs.length, published: p.published !== false });
  }
  return out;
}

/** Última sincronización de Tienda Nube (para mostrar cuándo se actualizó). */
export async function lastTnSync(projectId: string) {
  const { data } = await service().from("sync_logs").select("started_at,finished_at,status,detail").eq("project_id", projectId).eq("kind", "tiendanube").order("started_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}
