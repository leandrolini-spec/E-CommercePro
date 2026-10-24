import { mlGet } from "@/integrations/mercadolibre/client";
import { activeProjectId } from "@/modules/repo/supabase";

// Diagnóstico: hace una consulta de solo lectura a la API de Mercado Libre con las credenciales del proyecto.
// Protegido con el secreto del servidor; solo rutas GET conocidas; la respuesta se devuelve recortada.
const ALLOWED = ["/users/", "/items", "/orders", "/questions", "/shipments", "/messages", "/post-purchase", "/sites/", "/visits", "/marketplace"];

export async function POST(request: Request) {
  // trim: al pegar el secreto en el panel es común que se cuele un espacio o un salto de línea.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const { path, query, max } = (await request.json().catch(() => ({}))) as { path?: string; query?: Record<string, string | number>; max?: number };
  if (!path || !ALLOWED.some((p) => path.startsWith(p))) return Response.json({ error: "Ruta no permitida." }, { status: 400 });
  try {
    const data = await mlGet(await activeProjectId(), path, query);
    const text = JSON.stringify(data);
    return Response.json({ ok: true, length: text.length, data: text.length > (max ?? 6000) ? text.slice(0, max ?? 6000) + "…[recortado]" : data });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message, status: (e as { status?: number }).status ?? null });
  }
}
