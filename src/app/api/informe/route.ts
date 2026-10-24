import { hasValidSession } from "@/core/session";
import { today } from "@/lib/format";
import { getDb } from "@/modules/data";
import { buildInforme, informeTokenOk, validMes } from "@/modules/informe";
import { renderInformePdf } from "@/modules/informe-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Informe mensual en PDF. Se abre con la sesión iniciada o con el enlace firmado que se le manda a la contadora o el contador. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const mes = q.get("mes") ?? "";
  if (!validMes(mes)) return Response.json({ error: "Mes no válido." }, { status: 400 });
  if (!(await hasValidSession()) && !informeTokenOk(mes, q.get("t"))) return Response.json({ error: "No autorizado." }, { status: 401 });
  const pdf = await renderInformePdf(buildInforme(await getDb(), mes, today()));
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="informe-${mes}.pdf"`, "cache-control": "private, no-store" },
  });
}
