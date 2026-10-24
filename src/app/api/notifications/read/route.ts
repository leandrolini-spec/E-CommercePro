import { hasValidSession } from "@/core/session";
import { markKeysRead } from "@/modules/message-reads";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";

export const dynamic = "force-dynamic";

/** La campanita avisa qué mensajes y preguntas de Mercado Libre se marcaron como leídos, para que no vuelvan a avisar (en ningún dispositivo). */
export async function POST(req: Request) {
  if (!(await hasValidSession())) return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!isSupabase()) return Response.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 500) : [];
  const keys = ids.flatMap((id) => (id.startsWith("msg:") ? [`ml:m:${id.slice(4)}`] : id.startsWith("q:") ? [`ml:q:${id.slice(2)}`] : []));
  await markKeysRead(await activeProjectId(), keys).catch(() => {});
  return Response.json({ ok: true });
}
