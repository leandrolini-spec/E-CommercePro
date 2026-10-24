import { runScheduledTnSync } from "@/integrations/tiendanube/sync";

export const maxDuration = 60;

// Sincronización programada de Tienda Nube (con el secreto del servidor). ?full=1 repasa todo el historial.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) return Response.json({ error: "No autorizado." }, { status: 401 });
  const full = Boolean(new URL(request.url).searchParams.get("full"));
  return Response.json({ ok: true, results: await runScheduledTnSync({ full, maxMs: 50_000 }) });
}
export const GET = POST;
