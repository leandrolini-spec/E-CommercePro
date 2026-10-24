import { mlData, mlInboxData } from "@/integrations/mercadolibre/data";
import { hasValidSession } from "@/core/session";
import { tnLiveByProduct } from "@/integrations/tiendanube/data";
import { getDb } from "@/modules/data";
import { activeProjectId, service } from "@/modules/repo/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ms = async <T,>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> => { const t = Date.now(); const value = await fn(); return { ms: Date.now() - t, value }; };

/**
 * Diagnóstico de velocidad: mide cuánto tarda cada parte (sesión, base de datos, Mercado Libre, Tienda Nube) desde el servidor.
 * Solo con sesión iniciada. No devuelve datos del negocio, solo tiempos y tamaños.
 */
export async function GET() {
  const t0 = Date.now();
  const session = await ms(() => hasValidSession());
  if (!session.value) return Response.json({ error: "No autorizado." }, { status: 401 });
  const project = await ms(() => activeProjectId());
  const pid = project.value;
  const sb = service();

  // Cada tabla del negocio por separado (lo que lee getDb en cada pantalla)
  const tables = ["products", "stock_movements", "suppliers", "purchases", "customers", "sales", "quotes", "expenses", "cash_movements", "partner_advances", "shipments"];
  const perTable: Record<string, { ms: number; filas: number; kb: number }> = {};
  await Promise.all(tables.map(async (t) => {
    const r = await ms(async () => await sb.from(t).select("*").eq("project_id", pid));
    perTable[t] = { ms: r.ms, filas: r.value.data?.length ?? 0, kb: Math.round(JSON.stringify(r.value.data ?? []).length / 1024) };
  }));

  // Mercado Libre: cuánto pesa cada tipo de dato guardado
  const kinds = ["item", "item_visits", "question", "visits_daily", "visits_total", "user", "conversation", "message", "item_promos", "ads"];
  const ml: Record<string, { ms: number; filas: number; kb: number }> = {};
  await Promise.all(kinds.map(async (k) => {
    const r = await ms(async () => await sb.from("ml_resources").select("ml_id,data").eq("project_id", pid).eq("kind", k).limit(5000));
    ml[k] = { ms: r.ms, filas: r.value.data?.length ?? 0, kb: Math.round(JSON.stringify(r.value.data ?? []).length / 1024) };
  }));

  const [db, mlAll, mlLight, tn] = await Promise.all([ms(() => getDb()), ms(() => mlData(pid).catch(() => null)), ms(() => mlInboxData(pid).catch(() => null)), ms(() => tnLiveByProduct(pid).catch(() => new Map()))]);
  return Response.json({
    total_ms: Date.now() - t0, region: process.env.VERCEL_REGION ?? null, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    sesion_ms: session.ms, proyecto_activo_ms: project.ms,
    pantallas_en_paralelo_ms: { getDb: db.ms, mlData_completo: mlAll.ms, mlInbox_liviano: mlLight.ms, tiendanube_stock: tn.ms },
    tablas_del_negocio: perTable, mercado_libre_guardado: ml,
  });
}
