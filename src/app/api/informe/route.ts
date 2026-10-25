import { hasValidSession } from "@/core/session";
import { today } from "@/lib/format";
import { getDb, getDbForProject } from "@/modules/data";
import { onlyProjectId } from "@/modules/channel-project";
import { isSupabase } from "@/modules/repo/supabase";
import { buildInforme, informeTokenOk, validMes } from "@/modules/informe";
import { renderInformePdf } from "@/modules/informe-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Informe mensual en PDF. Se abre con la sesión iniciada o con el enlace firmado que se le manda a la contadora o el contador. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const mes = q.get("mes") ?? "";
  if (!validMes(mes)) return Response.json({ error: "Mes no válido." }, { status: 400 });
  const p = q.get("p"), t = q.get("t");
  let db;
  if (p && /^[0-9a-f-]{36}$/.test(p) && informeTokenOk(mes, t, p)) {
    db = await getDbForProject(p); // enlace firmado para esa empresa
  } else if (await hasValidSession()) {
    db = await getDb(); // sesión iniciada: la empresa de la persona
  } else if (!p && informeTokenOk(mes, t)) {
    // Enlace anterior (sin empresa): solo vale si la base tiene una única empresa.
    const only = isSupabase() ? await onlyProjectId() : null;
    if (isSupabase() && !only) return Response.json({ error: "No autorizado." }, { status: 401 });
    db = only ? await getDbForProject(only) : await getDb();
  } else {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const pdf = await renderInformePdf(buildInforme(db, mes, today()));
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="informe-${mes}.pdf"`, "cache-control": "private, no-store" },
  });
}
