import { mlInboxData } from "@/integrations/mercadolibre/data";
import { hasValidSession } from "@/core/session";
import { getDb } from "@/modules/data";
import { readKeys } from "@/modules/message-reads";
import { buildNotifications, type InboxNotice } from "@/modules/notifications";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";

export const dynamic = "force-dynamic";

/** Avisos de la campanita (ventas, mensajes y preguntas de ML, envíos). Solo con sesión iniciada. */
export async function GET() {
  if (!(await hasValidSession())) return Response.json({ error: "No autorizado." }, { status: 401 });
  // Todo en paralelo: antes cada consulta esperaba a la anterior.
  const projectId = isSupabase() ? await activeProjectId() : "";
  const [db, ml, inbox, reads] = await Promise.all([
    getDb(),
    isSupabase() ? mlInboxData(projectId).then((m) => ({ messages: m.messages, questions: m.questions })).catch(() => null) : Promise.resolve(null),
    isSupabase()
      ? service().from("inbox_threads").select("id,channel,kind,contact_name,subject,last_message,last_at").eq("project_id", projectId).eq("unread", true).eq("status", "abierto").order("last_at", { ascending: false }).limit(30)
          .then((r): InboxNotice[] => (r.data ?? []).map((t) => ({ id: String(t.id), channel: String(t.channel), kind: String(t.kind), name: String(t.contact_name), subject: String(t.subject), text: String(t.last_message), at: String(t.last_at) })))
      : Promise.resolve([] as InboxNotice[]),
    isSupabase() ? readKeys(projectId).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ]);
  return Response.json({ items: buildNotifications(db, ml, inbox, reads) });
}
