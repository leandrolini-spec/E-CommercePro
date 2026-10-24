import { mlConfigured } from "@/integrations/mercadolibre/config";

// Responde al instante y sin datos sensibles. `commit` indica la versión desplegada;
// `mlConfigured` solo dice si las variables de Mercado Libre están completas (sí/no).
export function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  return Response.json({ ok: true, commit, mlConfigured: mlConfigured() });
}
