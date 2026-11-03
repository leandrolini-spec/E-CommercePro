import { service } from "@/core/db-client";
import { demoMeta } from "./demo/whatsapp";
import type { MetaCampaign, MetaReport } from "./meta-report";
import { activeProjectId, isSupabase } from "./repo/supabase";
import type { Db } from "./types";

/**
 * Lo que dejan los anuncios de Meta entre dos fechas. Demostración: datos de ejemplo. Versión real: el gasto sale de la cuenta publicitaria
 * conectada; las ventas atribuidas se suman cuando se active la atribución (Tarea 13 del plan de WhatsApp y Meta).
 */
export async function getMetaReport(db: Db, from: string, to: string): Promise<MetaReport> {
  if (!isSupabase()) return db.isDemo ? demoMeta(db, from, to) : { connected: false, demo: false, campaigns: [], daily: [], attributionDays: 30 };
  const projectId = await activeProjectId();
  const sb = service();
  const { data: acc } = await sb.from("meta_ad_accounts").select("status").eq("project_id", projectId).maybeSingle();
  if (!acc) return { connected: false, demo: false, campaigns: [], daily: [], attributionDays: 30 };
  const { data } = await sb.from("meta_ad_spend").select("day,campaign_id,campaign_name,spend,impressions,clicks").eq("project_id", projectId).gte("day", from).lte("day", to).limit(20000);
  const byCamp = new Map<string, MetaCampaign>();
  const daily = new Map<string, number>();
  for (const r of data ?? []) {
    const c = byCamp.get(r.campaign_id) ?? { id: r.campaign_id, name: r.campaign_name, kind: "tienda" as const, spend: 0, impressions: 0, clicks: 0, conversations: 0, sales: 0, revenue: 0 };
    c.spend += Number(r.spend); c.impressions += Number(r.impressions); c.clicks += Number(r.clicks);
    byCamp.set(r.campaign_id, c);
    daily.set(r.day, (daily.get(r.day) ?? 0) + Number(r.spend));
  }
  return { connected: acc.status === "connected", demo: false, pending: true, attributionDays: 30, campaigns: [...byCamp.values()].sort((a, b) => b.spend - a.spend), daily: [...daily].sort().map(([date, spend]) => ({ date, spend, revenue: 0 })) };
}
