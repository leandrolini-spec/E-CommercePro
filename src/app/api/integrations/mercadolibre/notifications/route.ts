import { after } from "next/server";
import { enqueue, remindPendingQuestions, runQueue } from "@/integrations/mercadolibre/sync";
import { service } from "@/modules/repo/supabase";

// Tiempo máximo en Vercel (en Render no aplica).
export const maxDuration = 60;

// Mercado Libre exige un 200 en menos de 500 ms o desactiva el tópico: se guarda el aviso y se procesa después.
export async function POST(request: Request) {
  const n = await request.json().catch(() => null) as { topic?: string; resource?: string; user_id?: number | string; application_id?: number | string } | null;
  if (!n?.topic || !n.resource || !n.user_id) return new Response(null, { status: 200 });

  // Solo se aceptan avisos de la aplicación y de la cuenta conectada (un tercero no puede encolar trabajo).
  if (String(n.application_id) !== process.env.ML_CLIENT_ID) return new Response(null, { status: 200 });
  const { data: acc } = await service().from("ml_accounts").select("project_id").eq("ml_user_id", Number(n.user_id)).maybeSingle();
  if (!acc) return new Response(null, { status: 200 });

  try {
    await enqueue(acc.project_id, n.topic, n.resource, "notificación: vercel");
    after(() => runQueue(acc.project_id, { maxMs: process.env.VERCEL ? 40_000 : 20_000, max: 20, onlySource: "notificación" }).then(() => remindPendingQuestions(acc.project_id)).catch(() => {}));
  } catch {
    // Igual se responde 200: el aviso se recupera con la sincronización programada.
  }
  return new Response(null, { status: 200 });
}
