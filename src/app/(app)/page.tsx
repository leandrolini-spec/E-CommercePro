import Link from "next/link";
import { PageHeader, param, type SearchParams } from "@/components/shared/list";
import { Chart } from "@/components/ui/Chart";
import { Guide } from "@/components/ui/Guide";
import { Badge, EmptyState, KpiCard } from "@/components/ui/primitives";
import { fdate, int, money, pct } from "@/lib/format";
import { SOCIEDAD_DESDE, sociedadDb, alerts, byChannel, byProduct, costCoverage, dailySeries, kpis, PERIODS, periodRange, salesByPlace, topWithOthers, type Period } from "@/modules/calc";
import { mlData } from "@/integrations/mercadolibre/data";
import { mlAlerts } from "@/integrations/mercadolibre/status";
import { getDb } from "@/modules/data";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = (await searchParams) as SearchParams;
  const period = (PERIODS.find((p) => p.value === param(sp, "p"))?.value ?? "hoy") as Period;
  const { from, to } = periodRange(period);
  // Lo de Mercado Libre se consulta al mismo tiempo que la base (antes esperaba a que terminara cada cosa).
  const mlP = isSupabase()
    ? activeProjectId().then((id) => Promise.all([mlData(id, { messages: false }).catch(() => null), mlAlerts(id).catch(() => [])]))
    : Promise.resolve([null, []] as const);
  const all = await getDb();
  // Por defecto solo cuenta lo de la sociedad (desde el 1/10/2026); "Incluir lo anterior" muestra también el historial previo.
  const withHistory = param(sp, "h") === "1";
  const db = withHistory ? all : sociedadDb(all);
  const k = kpis(db, from, to);
  const cov = costCoverage(db, from, to);
  const series = dailySeries(db, from, to);
  const products = byProduct(db, from, to);
  const top = [...products].sort((a, b) => b.units - a.units).slice(0, 5);
  // Los productos sin costo cargado no entran en el ranking: su margen del 100 % sería engañoso.
  const withCost = products.filter((p) => p.cost > 0);
  const bestMargin = [...withCost].sort((a, b) => b.marginPct - a.marginPct).slice(0, 3);
  const worstMargin = [...withCost].sort((a, b) => a.marginPct - b.marginPct).slice(0, 3);
  // Las tortas usan todo el historial (no solo la sociedad ni el período elegido) y todos los canales.
  const history = [...all.sales].filter((x) => x.status !== "cancelada").sort((x, y) => x.date.localeCompare(y.date));
  const channelData = byChannel(all, "2000-01-01", "2999-12-31");
  // Todos los canales configurados figuran en el gráfico, aunque todavía vendan $0.
  const channelPie = [...topWithOthers(channelData, 8), ...all.settings.channels.filter((c) => !channelData.some((x) => x.label === c)).map((c) => ({ label: c, value: 0 }))];
  const productPie = topWithOthers(byProduct(all, "2000-01-01", "2999-12-31").map((p) => ({ label: p.name, value: p.units })), 5);
  const place = salesByPlace(all, "2000-01-01", "2999-12-31");
  // Visitas diarias que ya trajo Mercado Libre, recortadas al período elegido.
  const visits = ((await mlP)[0]?.visitsDaily ?? []).filter((v) => v.date >= from && v.date <= to).sort((x, y) => x.date.localeCompare(y.date));
  // Promedio de ventas por día: solo los días en que la sociedad ya existía (antes del 1/10 no se cuentan ventas).
  const firstDay = withHistory || from > SOCIEDAD_DESDE ? from : SOCIEDAD_DESDE;
  const activeDays = Math.max(1, Math.round((new Date(to + "T00:00:00Z").getTime() - new Date(firstDay + "T00:00:00Z").getTime()) / 86400000) + 1);
  const attention = [...alerts(db), ...(await mlP)[1]].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`${fdate(from)} al ${fdate(to)}`} />

      <nav className="flex flex-wrap gap-1.5" aria-label="Período">
        {PERIODS.map((p) => (
          <Link key={p.value} href={`?p=${p.value}${withHistory ? "&h=1" : ""}`} className={`rounded-full border px-3 py-1 text-sm ${p.value === period ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {p.label}
          </Link>
        ))}
      </nav>

      {from < SOCIEDAD_DESDE && (
        withHistory ? (
          <Guide title="Incluye el historial anterior a la sociedad">
            Estás viendo también lo vendido antes del {fdate(SOCIEDAD_DESDE)}. <Link href={`?p=${period}`} className="font-medium text-primary underline">Volver a solo la sociedad</Link>
          </Guide>
        ) : (
          <Guide tone="warning" title="Este período es anterior a la sociedad">
            Los números en $ 0 son porque desde el {fdate(SOCIEDAD_DESDE)} se cuenta lo de la sociedad y antes no entra. <Link href={`?p=${period}&h=1`} className="font-medium text-primary underline">Ver también lo anterior</Link>
          </Guide>
        )
      )}

      {cov.pct > 5 && (
        <Guide tone="warning" title="El margen de este período no es del todo confiable">
          El {cov.pct.toFixed(0)} % de lo facturado ({money(cov.missing)}) corresponde a productos sin costo cargado, por eso la ganancia sale más alta que la real. <Link href="/productos?cost=0" className="font-medium text-primary underline">Cargar costos</Link>
        </Guide>
      )}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Fila 1: actividad */}
        <KpiCard label="Ventas" value={int(k.sales)} />
        <KpiCard label="Unidades vendidas" value={int(k.units)} />
        <KpiCard label="Ticket promedio" value={money(k.ticket)} />
        <KpiCard label="Promedio de ventas por día" value={(k.sales / activeDays).toFixed(1).replace(".", ",")} hint={`${money(k.revenue / activeDays)} facturados por día`} />
        {/* Fila 2: lo que entra y lo que sale */}
        <KpiCard label="Facturación bruta" value={money(k.revenue)} />
        <KpiCard label="Cargos e impuestos del canal" value={money(k.fees)} hint={k.revenue ? `${pct((k.fees / k.revenue) * 100)} de la facturación` : undefined} />
        <KpiCard label="Gastos" value={money(k.expenses)} />
        <KpiCard label="Costos" value={money(k.cost)} hint="Costo de lo vendido" />
        {/* Fila 3: resultado */}
        <KpiCard label="Facturación neta" value={money(k.net)} hint="Neto cobrado, después de cargos" />
        <KpiCard label="Ganancia estimada" value={money(k.estimatedProfit)} hint="Margen menos cargos y costos de venta" />
        <KpiCard label="Resultado estimado" value={money(k.result)} hint="Ganancia menos gastos" />
        <KpiCard label="Rentabilidad %" value={pct(k.revenue ? (k.result / k.revenue) * 100 : 0)} hint="Resultado estimado sobre la facturación bruta" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Más vendidos"><Rank color="bg-success" rows={top.map((p) => ({ name: p.name, text: `${p.units} u.`, ratio: p.units / (top[0]?.units || 1) }))} /></Panel>
        <Panel title="Mayor margen"><Rank color="bg-success" rows={bestMargin.map((p) => ({ name: p.name, text: pct(p.marginPct), ratio: Math.max(0, p.marginPct) / 100 }))} /></Panel>
        <Panel title="Menor margen"><Rank color="bg-warning" rows={worstMargin.map((p) => ({ name: p.name, text: pct(p.marginPct), ratio: Math.max(0, p.marginPct) / 100 }))} /></Panel>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">Quién compra y qué se vende</h2>
        <p className="mb-3 text-sm text-muted">Todo el historial de ventas, de todos los canales ({int(history.length)} ventas desde el {history.length ? fdate(history[0].date) : "—"}).</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Ventas por canal (facturación)">{channelPie.length ? <Chart type="pie" format="money" data={channelPie} /> : <EmptyState title="Sin ventas" />}</Panel>
          <Panel title="Productos más vendidos (unidades)">{productPie.length ? <Chart type="pie" data={productPie} /> : <EmptyState title="Sin ventas" />}</Panel>
          <Panel title="Ventas por provincia">{place.provinces.length ? <Chart type="pie" format="sales" data={topWithOthers(place.provinces, 6)} /> : <EmptyState title="Sin datos" />}</Panel>
          <Panel title="Localidades que más compran (cantidad de ventas)">
            <Rank color="bg-success" rows={place.localities.slice(0, 10).map((l) => ({ name: l.label, text: `${l.value} ventas`, ratio: l.value / (place.localities[0]?.value || 1) }))} />
          </Panel>
        </div>
      </section>

      {attention.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Avisos <Badge tone="danger">{attention.length}</Badge></h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {attention.slice(0, 5).map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.tone === "danger" ? "bg-danger" : "bg-warning"}`} aria-label={a.tone === "danger" ? "Crítico" : "Advertencia"} />
                  <span className="font-medium">{a.title}</span>
                  <span className="hidden text-muted sm:inline">{a.detail}</span>
                  <span className="ml-auto text-primary">Ver →</span>
                </Link>
              </li>
            ))}
          </ul>
          {attention.length > 5 && <p className="mt-1 text-xs text-muted">Y {attention.length - 5} más.</p>}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Evolución de ventas"><Chart format="money" name="Facturación" data={series.map((s) => ({ label: s.label, value: Math.round(s.revenue) }))} /></Panel>
        <Panel title="Unidades vendidas"><Chart type="bar" name="Unidades" data={series.map((s) => ({ label: s.label, value: s.units }))} /></Panel>
        <Panel title="Evolución del margen"><Chart format="money" name="Margen" data={series.map((s) => ({ label: s.label, value: Math.round(s.margin) }))} /></Panel>
        <Panel title="Visitas por día (Mercado Libre)">
          <p className="mb-2 text-sm text-muted">
            Promedio de <strong className="text-ink">{(k.sales / activeDays).toFixed(1).replace(".", ",")} ventas por día</strong>
            {visits.length > 0 && <> · <strong className="text-ink">{int(Math.round(visits.reduce((a, v) => a + v.total, 0) / visits.length))} visitas por día</strong></>}
          </p>
          {visits.length ? <Chart type="bar" height={200} name="Visitas" data={visits.map((v) => ({ label: `${v.date.slice(8)}/${v.date.slice(5, 7)}`, value: v.total }))} /> : <EmptyState title="Sin visitas en el período" description="Las visitas se traen de Mercado Libre." />}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-surface p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Rank({ rows, color }: { rows: { name: string; text: string; ratio: number }[]; color: string }) {
  if (!rows.length) return <p className="text-sm text-muted">Sin datos en el período.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.name + i} className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg text-xs font-semibold text-muted">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium" title={r.name}>{r.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{r.text}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(4, r.ratio * 100))}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
