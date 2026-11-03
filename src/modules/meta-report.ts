/** Medición de lo que dejan los anuncios de Meta: tipos y cuentas simples (sin red ni base). */
export type MetaCampaign = {
  id: string; name: string;
  /** A dónde lleva el anuncio: a una conversación de WhatsApp, a una de Instagram o a la tienda online. */
  kind: "whatsapp" | "instagram" | "tienda";
  spend: number; impressions: number; clicks: number; conversations: number; sales: number; revenue: number;
};
export type MetaReport = {
  /** Hay datos de una cuenta publicitaria conectada (o de demostración). */
  connected: boolean; demo: boolean;
  campaigns: MetaCampaign[];
  daily: { date: string; spend: number; revenue: number }[];
  /** Cuántos días mira la atribución (desde el primer mensaje o clic del anuncio hasta la compra). */
  attributionDays: number;
  /** Hay gasto de anuncios pero todavía no se atribuyen ventas (versión real: se activa con la Tarea 13 del plan). */
  pending?: boolean;
};

export const KIND_LABEL: Record<MetaCampaign["kind"], string> = { whatsapp: "A WhatsApp", instagram: "A Instagram", tienda: "A la tienda" };

/** Retorno: cuánto se facturó por cada peso invertido. */
export const roas = (c: Pick<MetaCampaign, "spend" | "revenue">) => (c.spend > 0 ? c.revenue / c.spend : 0);
/** Costo de cada venta atribuida. */
export const costPerSale = (c: Pick<MetaCampaign, "spend" | "sales">) => (c.sales > 0 ? c.spend / c.sales : 0);

export function totals(r: Pick<MetaReport, "campaigns">) {
  const t = r.campaigns.reduce((a, c) => ({ spend: a.spend + c.spend, conversations: a.conversations + c.conversations, sales: a.sales + c.sales, revenue: a.revenue + c.revenue, clicks: a.clicks + c.clicks }), { spend: 0, conversations: 0, sales: 0, revenue: 0, clicks: 0 });
  return { ...t, roas: roas(t), costPerSale: costPerSale(t) };
}
