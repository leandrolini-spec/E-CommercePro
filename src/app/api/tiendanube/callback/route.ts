import { NextResponse } from "next/server";
import { publicBase } from "@/integrations/mercadolibre/base-url";
import { completeAuthorization } from "@/integrations/tiendanube/oauth";

// Tienda Nube redirige acá con ?code y ?state después de que se aceptan los permisos.
export async function GET(request: Request) {
  const base = publicBase(request);
  const sp = new URL(request.url).searchParams;
  const back = (q: string) => NextResponse.redirect(`${base}/tiendanube?${q}`);
  if (sp.get("error")) return back(`error=${encodeURIComponent(sp.get("error_description") || sp.get("error")!)}`);
  const code = sp.get("code"), state = sp.get("state");
  if (!code || !state) return back("error=" + encodeURIComponent("Faltan datos en la respuesta de Tienda Nube."));
  try {
    await completeAuthorization(code, state);
    return back("conectado=1");
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
