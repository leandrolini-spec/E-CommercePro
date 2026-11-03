/** Cliente de solo lectura de la API de anuncios de Meta (Marketing API): trae el gasto diario por campaña. */
const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v23.0"}`;

export type AdSpendRow = { day: string; campaignId: string; campaignName: string; spend: number; impressions: number; clicks: number; currency: string };

type Page<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string; code?: number } };

async function get<T>(url: string, token: string): Promise<Page<T> & T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) });
  const body = (await res.json().catch(() => ({}))) as Page<T> & T;
  if (!res.ok || body.error) {
    const code = body.error?.code;
    throw new Error(code === 190 ? "El acceso a Meta Ads venció o se revocó: reconectalo." : body.error?.message || `Error ${res.status}`);
  }
  return body;
}

/** Comprueba el token y la cuenta publicitaria; devuelve su nombre y moneda. */
export async function adAccountInfo(token: string, adAccountId: string): Promise<{ name: string; currency: string }> {
  const r = await get<{ name?: string; currency?: string }>(`${GRAPH()}/act_${adAccountId}?fields=name,currency`, token);
  return { name: r.name ?? "", currency: r.currency ?? "ARS" };
}

/** Gasto, impresiones y clics por día y campaña entre dos fechas (AAAA-MM-DD). */
export async function adSpend(token: string, adAccountId: string, since: string, until: string): Promise<AdSpendRow[]> {
  const fields = "campaign_id,campaign_name,spend,impressions,clicks,account_currency";
  let url: string | undefined = `${GRAPH()}/act_${adAccountId}/insights?level=campaign&time_increment=1&fields=${fields}&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500`;
  const rows: AdSpendRow[] = [];
  for (let page = 0; url && page < 40; page++) {
    const r: Page<Record<string, string>> = await get<Record<string, string>>(url, token);
    for (const x of r.data ?? []) rows.push({ day: x.date_start, campaignId: x.campaign_id, campaignName: x.campaign_name, spend: Number(x.spend) || 0, impressions: Number(x.impressions) || 0, clicks: Number(x.clicks) || 0, currency: x.account_currency || "ARS" });
    url = r.paging?.next;
  }
  return rows;
}
