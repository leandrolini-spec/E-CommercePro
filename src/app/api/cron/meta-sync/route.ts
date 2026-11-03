import { runScheduledAdSync } from "@/integrations/meta-ads/sync";

export const maxDuration = 60;

// Trae el gasto de anuncios de Meta de todas las empresas con cuenta publicitaria conectada (con el secreto del servidor).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) return Response.json({ error: "No autorizado." }, { status: 401 });
  return Response.json({ ok: true, results: await runScheduledAdSync() });
}
export const GET = POST;
