import { memo } from "@/lib/memo";
import { service } from "@/modules/repo/supabase";
import { mlConfigured, mlMissing } from "./config";

export function mlStatus(projectId: string) {
  return memo(`ml:${projectId}:status`, process.env.VERCEL ? 0 : 10_000, () => loadStatus(projectId));
}

async function loadStatus(projectId: string) {
  const sb = service();
  const [acc, logs, pending, errors, kinds] = await Promise.all([
    sb.from("ml_accounts").select("ml_user_id,nickname,site_id,status,last_error,connected_at,scope,expires_at").eq("project_id", projectId).maybeSingle(),
    sb.from("sync_logs").select("*").eq("project_id", projectId).order("started_at", { ascending: false }).limit(6),
    sb.from("sync_jobs").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "pendiente"),
    sb.from("sync_jobs").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "error"),
    sb.from("ml_resources").select("kind").eq("project_id", projectId).limit(5000),
  ]);
  const counts = new Map<string, number>();
  for (const r of kinds.data ?? []) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  return {
    configured: mlConfigured(), missing: mlMissing(), account: acc.data, logs: logs.data ?? [], pending: pending.count ?? 0, failed: errors.count ?? 0,
    counts: [...counts].sort((a, b) => b[1] - a[1]),
  };
}

/** Avisos para el Dashboard principal: preguntas sin responder y publicaciones pausadas. */
export function mlAlerts(projectId: string) {
  return memo(`ml:${projectId}:alerts`, process.env.VERCEL ? 0 : 20_000, () => loadAlerts(projectId));
}

async function loadAlerts(projectId: string) {
  const sb = service();
  const [q, paused] = await Promise.all([
    sb.from("ml_resources").select("ml_id", { count: "exact", head: true }).eq("project_id", projectId).eq("kind", "question").eq("data->>status", "UNANSWERED"),
    sb.from("ml_resources").select("ml_id", { count: "exact", head: true }).eq("project_id", projectId).eq("kind", "item").eq("data->>status", "paused"),
  ]);
  const unreadMsgs = await sb.from("ml_resources").select("ml_id", { count: "exact", head: true }).eq("project_id", projectId).eq("kind", "message").is("data->messages->0->message_date->>read", null);
  const out: { key: string; tone: "danger" | "warning"; title: string; detail: string; href: string }[] = [];
  if (q.count) out.push({ key: "ml-q", tone: "danger", title: `${q.count} pregunta${q.count === 1 ? "" : "s"} de Mercado Libre sin responder`, detail: "Responder rápido mejora la conversión y la reputación.", href: "/mercadolibre?tab=preguntas&qs=UNANSWERED" });
  if (unreadMsgs.count) out.push({ key: "ml-m", tone: "warning", title: `${unreadMsgs.count} mensaje${unreadMsgs.count === 1 ? "" : "s"} de comprador sin leer`, detail: "Los compradores suelen dejar su domicilio y teléfono ahí.", href: "/mercadolibre?tab=mensajes" });
  if (paused.count) out.push({ key: "ml-p", tone: "warning", title: `${paused.count} ${paused.count === 1 ? "publicación pausada" : "publicaciones pausadas"}`, detail: "No están vendiendo mientras estén pausadas.", href: "/mercadolibre?tab=publicaciones&is=paused" });
  return out;
}
