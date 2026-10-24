import { after, NextResponse } from "next/server";
import { mlGet } from "@/integrations/mercadolibre/client";
import { completeAuthorization } from "@/integrations/mercadolibre/oauth";
import { backfill, drain } from "@/integrations/mercadolibre/sync";
import { service } from "@/modules/repo/supabase";
import { publicBase } from "@/integrations/mercadolibre/base-url";

// Tiempo máximo en Vercel (en Render no aplica).
export const maxDuration = 60;

// Mercado Libre redirige acá con ?code y ?state. La dirección es fija, sin datos variables.
export async function GET(request: Request) {
  const base = publicBase(request);
  const sp = new URL(request.url).searchParams;
  const back = (q: string) => NextResponse.redirect(`${base}/mercadolibre?${q}`);
  if (sp.get("error")) return back(`error=${encodeURIComponent(sp.get("error_description") || sp.get("error")!)}`);
  const code = sp.get("code"), state = sp.get("state");
  if (!code || !state) return back("error=" + encodeURIComponent("Faltan datos en la respuesta de Mercado Libre."));
  try {
    const { projectId } = await completeAuthorization(code, state);
    const me = await mlGet<{ nickname?: string; site_id?: string }>(projectId, "/users/me");
    await service().from("ml_accounts").update({ nickname: me.nickname ?? null, site_id: me.site_id ?? null }).eq("project_id", projectId);
    // Trae el historial en segundo plano, sin hacer esperar al usuario.
    await backfill(projectId);
    after(() => drain(projectId, "conexión", process.env.VERCEL ? 50_000 : 240_000).catch(() => {}));
    return back("conectado=1");
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
