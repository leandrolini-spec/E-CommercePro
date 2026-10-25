import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/layout/AutoRefresh";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NoCompany } from "@/components/layout/NoCompany";
import { Sidebar } from "@/components/layout/Sidebar";
import { ErrorState } from "@/components/ui/primitives";
import { isAuthBypassed } from "@/core/env";
import { enabledModules } from "@/core/modules";
import { brandSoft } from "@/lib/brand";
import { getDb } from "@/modules/data";
import { CompanyError } from "@/modules/repo/supabase";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifySession } from "@/core/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isAuthBypassed()) {
    const store = await cookies();
    let ok = false;
    try {
      ({ ok } = await verifySession(store.get(ACCESS_COOKIE)?.value, store.get(REFRESH_COOKIE)?.value));
    } catch (e) {
      return (
        <div className="p-8">
          <ErrorState title="Configuración incompleta" description={(e as Error).message} />
        </div>
      );
    }
    if (!ok) redirect("/login");
  }

  let db;
  try {
    db = await getDb();
  } catch (e) {
    // Sesión válida pero sin empresa: se avisa en vez de mandar al login (que lo volvería a dejar entrar).
    if (e instanceof CompanyError && e.reason === "no-company") return <NoCompany message={e.message} />;
    if (e instanceof CompanyError) redirect("/login");
    throw e;
  }
  const integrationsOff = db.settings.company?.integrationsOff ?? [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar modules={enabledModules().filter((m) => !integrationsOff.includes(m.slug))} name={db.settings.name} logoUrl={db.settings.brand?.logoUrl || undefined} soft={brandSoft(db.settings.brand)} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {db.isDemo && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            <span className="rounded bg-warning px-1.5 py-0.5 font-semibold text-white">DEMO</span>
            Estás viendo datos de demostración. Podés volver a tus datos desde Configuración.
          </div>
        )}
        <div className="-mt-1 mb-3 flex justify-end"><NotificationBell /></div>
        {children}
        <AutoRefresh />
      </main>
    </div>
  );
}
