/** Dirección pública del servicio. Detrás del proxy de Render, request.url trae la interna (localhost:10000). */
export function publicBase(request: Request): string {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
