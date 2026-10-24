import { runScheduledSync } from "@/integrations/mercadolibre/sync";

// Tiempo máximo en Vercel (en Render no aplica).
export const maxDuration = 60;

// Disparo manual de la sincronización (con el secreto del servidor). ?full=1 trae todo el historial.
export async function POST(request: Request) {
  // trim: al pegar el secreto en el panel es común que se cuele un espacio o un salto de línea.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const full = Boolean(new URL(request.url).searchParams.get("full"));
  return Response.json({ ok: true, results: await runScheduledSync({ full, maxMs: 50_000 }) });
}
export const GET = POST;
