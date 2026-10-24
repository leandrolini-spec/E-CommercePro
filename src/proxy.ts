import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Chequeo optimista: solo mira si hay cookies de sesión. La verificación real
// del token se hace en el layout de (app) y en cada route handler protegido.
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/logout", "/api/health", "/p/", "/seguimiento/", "/icon", "/apple-icon"];
// Galería de componentes: la propia página devuelve 404 en producción.
const DEV_ONLY_PREFIXES = ["/ui"];
// Se autentican con su propio secreto, no con cookie.
const SECRET_PREFIXES = ["/api/cron", "/api/integrations", "/api/tiendanube/webhooks", "/api/messaging", "/api/informe"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1") {
    return NextResponse.next();
  }
  if ([...PUBLIC_PREFIXES, ...SECRET_PREFIXES, ...DEV_ONLY_PREFIXES].some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession =
    request.cookies.has("sb-access-token") || request.cookies.has("sb-refresh-token");
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
