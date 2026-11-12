import { hasValidSession } from "@/core/session";
import { mlGetFile } from "@/integrations/mercadolibre/client";
import { activeProjectId } from "@/modules/repo/supabase";

export const dynamic = "force-dynamic";

/** Foto o archivo que un comprador adjuntó en un mensaje de Mercado Libre. Mercado Libre lo entrega solo con el token del vendedor, así que se baja desde acá. */
export async function GET(request: Request) {
  if (!(await hasValidSession())) return Response.json({ error: "No autorizado." }, { status: 401 });
  const file = new URL(request.url).searchParams.get("f") ?? "";
  if (!/^[\w.\-]{1,200}$/.test(file) || file.includes("..")) return Response.json({ error: "Archivo no válido." }, { status: 400 });
  try {
    const { bytes, type } = await mlGetFile(await activeProjectId(), `/messages/attachments/${file}`, { tag: "post_sale", site_id: "MLA" });
    return new Response(bytes, { headers: { "content-type": type, "content-disposition": `inline; filename="${file}"`, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch {
    return Response.json({ error: "No se pudo bajar el archivo de Mercado Libre." }, { status: 502 });
  }
}
