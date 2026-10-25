import { mlGet } from "@/integrations/mercadolibre/client";
import { onlyProjectId } from "@/modules/channel-project";

// Diagnóstico: hace una consulta de solo lectura a la API de Mercado Libre con las credenciales del proyecto.
// Protegido con el secreto del servidor; solo rutas GET conocidas; la respuesta se devuelve recortada.
// No tiene sesión: la empresa se indica con "projectId" o, si la base tiene una sola, se usa esa.
const ALLOWED = ["/users/", "/items", "/orders", "/questions", "/shipments", "/messages", "/post-purchase", "/sites/", "/visits", "/marketplace"];

export async function POST(request: Request) {
  // trim: al pegar el secreto en el panel es común que se cuele un espacio o un salto de línea.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const { path, query, max, projectId } = (await request.json().catch(() => ({}))) as { path?: string; query?: Record<string, string | number>; max?: number; projectId?: string };
  if (!path || !ALLOWED.some((p) => path.startsWith(p))) return Response.json({ error: "Ruta no permitida." }, { status: 400 });
  try {
    const pid = projectId || (await onlyProjectId());
    if (!pid) return Response.json({ error: "Hay más de una empresa: indicá projectId." }, { status: 400 });
    const data = await mlGet(pid, path, query);
    const text = JSON.stringify(data);
    return Response.json({ ok: true, length: text.length, data: text.length > (max ?? 6000) ? text.slice(0, max ?? 6000) + "…[recortado]" : data });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message, status: (e as { status?: number }).status ?? null });
  }
}
