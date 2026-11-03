import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, PageHeader, param, type SearchParams } from "@/components/shared/list";
import { Chart } from "@/components/ui/Chart";
import { DataTable } from "@/components/ui/DataTable";
import { Guide } from "@/components/ui/Guide";
import { Badge, EmptyState, KpiCard } from "@/components/ui/primitives";
import { connectMetaAds, disconnectMetaAds, syncMetaAdsNow } from "@/integrations/meta-ads/actions";
import { adAccountState } from "@/integrations/meta-ads/sync";
import { int, isoDaysAgo, money, today } from "@/lib/format";
import { getDb } from "@/modules/data";
import { getMetaReport } from "@/modules/meta-data";
import { costPerSale, KIND_LABEL, roas, totals } from "@/modules/meta-report";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";

const RANGES = [[7, "7 días"], [30, "30 días"], [90, "90 días"]] as const;
const times = (n: number) => `${n.toFixed(1).replace(".", ",")} veces`;

async function disconnect() { "use server"; await disconnectMetaAds(); }
async function syncNow() { "use server"; await syncMetaAdsNow(); }

export default async function AnunciosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r[0]) === param(sp, "d"))?.[0] ?? 30;
  const db = await getDb();
  const supa = isSupabase();
  const from = isoDaysAgo(days - 1), to = today();
  const report = await getMetaReport(db, from, to);
  const state = supa ? await adAccountState(await activeProjectId()).catch(() => ({ connected: false } as Awaited<ReturnType<typeof adAccountState>>)) : { connected: report.demo, adAccountId: report.demo ? "1234567890" : undefined, lastSync: undefined, error: undefined };
  const t = totals(report);
  const camps = [...report.campaigns].sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
  const label = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

  const connectDrawer = (
    <CreateDrawer
      buttonLabel="Conectar cuenta publicitaria" title="Conectar anuncios de Meta" action={connectMetaAds}
      fields={[
        { name: "adAccountId", label: "Identificador de la cuenta publicitaria", required: true, placeholder: "1234567890", help: "Lo ves en el Administrador de Anuncios, arriba a la izquierda." },
        { name: "token", label: "Token de acceso (solo lectura)", type: "textarea", required: true, rows: 4, help: "Se guarda cifrado. Solo se usa para leer cuánto gastás en cada campaña." },
        { name: "como", label: "¿De dónde saco estos datos?", type: "guide", defaultValue: "1) En Meta Business → Configuración del negocio → Usuarios del sistema, creá un usuario y asignale tu cuenta publicitaria con permiso de lectura.\n2) Generá un token para tu app de Meta con el permiso «ads_read».\n3) Pegá el identificador de la cuenta publicitaria y el token acá: se comprueban con Meta antes de guardar.\n\nCarritix nunca crea, edita ni pausa anuncios: solo lee el gasto." },
      ]}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Anuncios de Meta" subtitle="Cuánto invertís, cuántas conversaciones y ventas dejan y cuánto vuelve por cada campaña"
        actions={!state.connected && supa ? connectDrawer : undefined}
      />

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Período">
        {RANGES.map(([d, l]) => (
          <Link key={d} href={`?d=${d}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${d === days ? "border-primary bg-primary text-white shadow-soft" : "border-line bg-surface text-muted hover:bg-mint hover:text-ink"}`}>Últimos {l}</Link>
        ))}
        {report.demo && <Badge tone="info">Datos de ejemplo</Badge>}
      </nav>

      {!state.connected ? (
        <EmptyState title="Todavía no conectaste tu cuenta publicitaria" description="Conectala en modo lectura y vas a ver cuánto gastás en cada campaña y cuántas ventas deja." action={supa ? connectDrawer : undefined} />
      ) : (
        <>
          {report.pending && <Guide tone="warning" title="Por ahora se muestra la inversión">La atribución de ventas a cada anuncio se suma en una próxima etapa. Mientras tanto ves cuánto gastás por campaña y por día.</Guide>}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Inversión" value={money(t.spend)} hint={`${int(t.clicks)} clics en el período`} />
            <KpiCard label="Conversaciones" value={int(t.conversations)} hint="Desde anuncios a WhatsApp o Instagram" />
            <KpiCard label="Ventas atribuidas" value={int(t.sales)} hint={`Compras dentro de ${report.attributionDays} días del anuncio`} />
            <KpiCard label="Facturación atribuida" value={money(t.revenue)} />
            <KpiCard label="Retorno" value={t.spend > 0 ? times(t.roas) : "—"} hint="Facturado por cada peso invertido" />
            <KpiCard label="Costo por venta" value={t.sales > 0 ? money(t.costPerSale) : "—"} hint="Inversión dividida las ventas" />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="lift rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />Inversión por día</h3>
              <Chart type="bar" format="money" name="Inversión" color="#8a93a0" data={report.daily.map((d) => ({ label: label(d.date), value: Math.round(d.spend) }))} />
            </div>
            <div className="lift rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />Facturación atribuida por día</h3>
              <Chart type="bar" format="money" name="Facturación" data={report.daily.map((d) => ({ label: label(d.date), value: Math.round(d.revenue) }))} />
            </div>
          </section>

          <DataTable
            rows={camps} rowKey={(c) => c.id} emptyTitle="Sin campañas en el período" compact
            columns={[
              { key: "n", header: "Campaña", render: (c) => <div><p className="text-sm font-medium">{c.name}</p><p className="text-[11px] text-muted">{KIND_LABEL[c.kind]}</p></div> },
              { key: "s", header: "Inversión", align: "right", render: (c) => <span className="tabular-nums">{money(c.spend)}</span> },
              { key: "k", header: "Clics", align: "right", render: (c) => <span className="tabular-nums">{int(c.clicks)}</span> },
              { key: "c", header: "Conversaciones", align: "right", render: (c) => <span className="tabular-nums">{c.kind === "tienda" ? "—" : int(c.conversations)}</span> },
              { key: "v", header: "Ventas", align: "right", render: (c) => <span className="tabular-nums">{int(c.sales)}</span> },
              { key: "f", header: "Facturación", align: "right", render: (c) => <span className="tabular-nums">{money(c.revenue)}</span> },
              { key: "r", header: "Retorno", align: "right", render: (c) => <Badge tone={roas(c) >= 3 ? "success" : roas(c) >= 1.5 ? "warning" : "danger"}>{c.spend > 0 ? times(roas(c)) : "—"}</Badge> },
              { key: "p", header: "Costo por venta", align: "right", render: (c) => <span className="tabular-nums">{c.sales > 0 ? money(costPerSale(c)) : "—"}</span> },
            ]}
          />

          <Guide title="¿Cómo se atribuye una venta a un anuncio?">
            Cuando alguien escribe desde un anuncio que abre WhatsApp o Instagram, Meta avisa de qué anuncio vino y queda guardado en la conversación. Si ese cliente compra dentro de los {report.attributionDays} días, la venta se atribuye a esa campaña. Las ventas de Tienda Nube que llegan por un anuncio se atribuyen por el enlace de entrada del pedido. Las de Mercado Libre no se pueden vincular con Meta.
          </Guide>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
            <p className="text-sm text-muted"><strong className="text-ink">Cuenta publicitaria {state.adAccountId ? `act_${state.adAccountId}` : ""}</strong>{report.demo ? " · de ejemplo (demostración)" : state.lastSync ? ` · última actualización ${new Date(state.lastSync).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}` : ""}{state.error ? <span className="text-danger"> · {state.error}</span> : null}</p>
            {supa && (
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton action={syncNow} label="Actualizar ahora" />
                <ConfirmActionButton action={disconnect} label="Desconectar" message="¿Desconectar la cuenta publicitaria? Se borra el gasto guardado." />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
