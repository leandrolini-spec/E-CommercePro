import { service } from "./repo/supabase";

/**
 * Avisos al celular del negocio. Se usa ntfy.sh (gratis): el teléfono instala la app ntfy y se suscribe al "tema" del negocio.
 * Los avisos son genéricos (título de la publicación, sin el texto ni el nombre del cliente) y salen sin intervención de ninguna IA.
 */
export async function alertsTopic(projectId: string): Promise<string | null> {
  const { data } = await service().from("project_settings").select("company").eq("project_id", projectId).single();
  const a = (data?.company as { alerts?: { enabled?: boolean; ntfyTopic?: string } } | null)?.alerts;
  return a?.enabled && a.ntfyTopic ? a.ntfyTopic : null;
}

export async function sendPhoneAlert(projectId: string, a: { title: string; message: string; path?: string; priority?: number }): Promise<boolean> {
  const topic = await alertsTopic(projectId).catch(() => null);
  if (!topic) return false;
  const base = (process.env.APP_BASE_URL ?? "https://tu-crm.vercel.app").replace(/\/$/, "");
  try {
    const r = await fetch("https://ntfy.sh/", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, title: a.title, message: a.message, click: `${base}${a.path ?? "/mensajes"}`, priority: a.priority ?? 4, tags: ["bell"] }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok;
  } catch { return false; }
}
