import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthBypassed } from "@/core/env";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifySession } from "@/core/session";

/** Pantallas para imprimir (sin menú ni barras): mismas reglas de acceso que el resto de la app. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthBypassed()) {
    const store = await cookies();
    let ok = false;
    try {
      ({ ok } = await verifySession(store.get(ACCESS_COOKIE)?.value, store.get(REFRESH_COOKIE)?.value));
    } catch {
      redirect("/login");
    }
    if (!ok) redirect("/login");
  }
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
