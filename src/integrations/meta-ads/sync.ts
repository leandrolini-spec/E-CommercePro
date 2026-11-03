import { decrypt, encrypt } from "@/core/crypto";
import { service } from "@/core/db-client";
import { adSpend } from "./client";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Guarda la cuenta publicitaria (token cifrado) de la empresa. */
export async function saveAdAccount(projectId: string, adAccountId: string, token: string) {
  const { error } = await service().from("meta_ad_accounts").upsert({ project_id: projectId, ad_account_id: adAccountId, token_enc: encrypt(token), status: "connected", last_error: null, connected_at: new Date().toISOString() });
  if (error) throw new Error(`No se pudo guardar la cuenta publicitaria: ${error.message}`);
}
export async function deleteAdAccount(projectId: string) {
  const sb = service();
  await sb.from("meta_ad_spend").delete().eq("project_id", projectId);
  await sb.from("meta_ad_accounts").delete().eq("project_id", projectId);
}
export async function adAccountState(projectId: string): Promise<{ connected: boolean; adAccountId?: string; lastSync?: string; error?: string }> {
  const { data } = await service().from("meta_ad_accounts").select("ad_account_id,status,last_sync_at,last_error").eq("project_id", projectId).maybeSingle();
  return data ? { connected: data.status === "connected", adAccountId: data.ad_account_id, lastSync: data.last_sync_at ?? undefined, error: data.last_error ?? undefined } : { connected: false };
}

/** Trae el gasto de los últimos días de una empresa y lo guarda (se puede repetir sin duplicar: la clave es día + campaña). */
export async function syncAds(projectId: string, days = 35): Promise<number> {
  const sb = service();
  const { data: acc } = await sb.from("meta_ad_accounts").select("ad_account_id,token_enc").eq("project_id", projectId).maybeSingle();
  if (!acc) return 0;
  const until = new Date(), since = new Date(Date.now() - days * 86_400_000);
  try {
    const rows = await adSpend(decrypt(acc.token_enc), acc.ad_account_id, day(since), day(until));
    if (rows.length) {
      const { error } = await sb.from("meta_ad_spend").upsert(rows.map((r) => ({ project_id: projectId, day: r.day, campaign_id: r.campaignId, campaign_name: r.campaignName, spend: r.spend, impressions: r.impressions, clicks: r.clicks, currency: r.currency })));
      if (error) throw new Error(error.message);
    }
    await sb.from("meta_ad_accounts").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" }).eq("project_id", projectId);
    return rows.length;
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("meta_ad_accounts").update({ last_error: msg, ...(/venció|revoc/.test(msg) ? { status: "expired" } : {}) }).eq("project_id", projectId);
    throw e;
  }
}

/** Tarea programada: recorre las empresas con cuenta publicitaria conectada; si una falla, las demás siguen. */
export async function runScheduledAdSync(): Promise<{ projectId: string; rows?: number; error?: string }[]> {
  const { data } = await service().from("meta_ad_accounts").select("project_id").eq("status", "connected");
  const out: { projectId: string; rows?: number; error?: string }[] = [];
  for (const a of data ?? []) {
    try { out.push({ projectId: a.project_id, rows: await syncAds(a.project_id) }); } catch (e) { out.push({ projectId: a.project_id, error: (e as Error).message }); }
  }
  return out;
}
