import Link from "next/link";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { bannerOf, themeProps } from "@/components/shared/platform-theme";
import { saveMlFollowers } from "@/modules/settings-actions";
import { ActionButton, Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { Chart } from "@/components/ui/Chart";
import { DataTable } from "@/components/ui/DataTable";
import { ContactButtons } from "@/components/shared/ContactButtons";
import { ListingFlags } from "@/components/ui/ListingFlags";
import { Guide } from "@/components/ui/Guide";
import { Alert, Badge, EmptyState, KpiCard } from "@/components/ui/primitives";
import { fdate, int, isoDaysAgo, money, pct, today } from "@/lib/format";
import { answerQuestion, reloadAll, replyToBuyer, syncNow } from "@/integrations/mercadolibre/actions";
import { saveCustomerData } from "@/modules/actions";
import { ITEM_STATUS, mlData, Q_STATUS, REPUTATION } from "@/integrations/mercadolibre/data";
import { mlStatus } from "@/integrations/mercadolibre/status";
import { byProduct, kpis, PERIODS, periodRange, saleTotals, type Period } from "@/modules/calc";
import { looksLikeUser, mlUserOf } from "@/modules/customers";
import { getDb } from "@/modules/data";
import { quickForQuestion } from "@/modules/quick-replies";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import type { Db } from "@/modules/types";

/** Azul de Mercado Libre: es el color de las barras y líneas de esta sección (el resto del CRM va en verde y negro). */
const ML_BLUE = "#3483fa";

// Tiempo máximo en Vercel (en Render no aplica).
export const maxDuration = 60;

const TABS = [["resumen", "Resumen"], ["ventas", "Ventas"], ["publicaciones", "Publicaciones"], ["preguntas", "Preguntas"], ["mensajes", "Mensajes"], ["clientes", "Clientes"], ["zonas", "Dónde compran"]] as const;
const RANGES = PERIODS;

function range(p: string): { from: string; to: string } {
  return periodRange((PERIODS.find((x) => x.value === p)?.value ?? "hoy") as Period);
}

export default async function MercadoLibrePage({ searchParams }: PageProps<"/mercadolibre">) {
  const sp = (await searchParams) as SearchParams;
  const db = await getDb();
  const st = isSupabase() ? await mlStatus(await activeProjectId()) : null;
  const connected = st?.account?.status === "connected";
  const tab = TABS.find((t) => t[0] === param(sp, "tab"))?.[0] ?? "resumen";
  const data = connected ? await mlData(await activeProjectId()) : null;
  const mlDb: Db = { ...db, sales: db.sales.filter((x) => x.channel === "Mercado Libre") };

  return (
    <div {...themeProps("ml", "space-y-6")}>
      <PageHeader title="Mercado Libre" banner={bannerOf("ml")} logo={{ src: "/brand/mercadolibre-color.png", height: 40 }} subtitle={connected ? `Cuenta ${st!.account!.nickname ?? ""}` : `Sitio de referencia: ${db.settings.mlSite}`} />
      {param(sp, "conectado") && <Alert tone="success" title="Cuenta conectada">Se está trayendo el historial. En unos minutos aparecen las ventas, publicaciones y preguntas.</Alert>}
      {param(sp, "error") && <Alert tone="danger" title="No se pudo conectar">{param(sp, "error")}</Alert>}

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:text-center">
          <div>
            <p className="flex flex-wrap items-center gap-2 font-semibold max-md:justify-center">
              Conexión{" "}
              {!st ? <Badge>Sin base de datos</Badge> : !st.configured ? <Badge tone="warning">Falta configurar</Badge> : connected ? <Badge tone="success">Conectado</Badge> : st.account ? <Badge tone="danger">Requiere reconectar</Badge> : <Badge>No conectado</Badge>}
              {connected && st!.pending > 0 && <Badge tone="info">Importando… {st!.pending} pendientes</Badge>}
            </p>
            <p className="mt-1 text-sm text-muted">
              {connected ? `Conectada el ${fdate(st!.account!.connected_at)}. ${st!.logs[0] ? `Última sincronización: ${fdate(st!.logs[0].started_at)} (${st!.logs[0].status}).` : ""}` : "Se conecta con la autorización oficial de Mercado Libre. La app nunca pide tu usuario ni tu contraseña."}
            </p>
            {st?.account?.last_error && <p className="mt-1 text-xs text-danger">Último error: {st.account.last_error}</p>}
            {st && !st.configured && <p className="mt-1 text-sm text-warning">Faltan o no son válidas estas variables en el servidor: <strong>{st.missing.join(", ")}</strong>.</p>}
          </div>
          <div className="flex flex-wrap gap-2 max-md:w-full max-md:flex-col">
            {st?.configured && <div className="w-full sm:w-56"><a href="/api/integrations/mercadolibre/connect" className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover">{connected ? "Volver a autorizar" : "Conectar Mercado Libre"}</a></div>}
            {connected && <div className="w-full sm:w-56"><ActionButton action={syncNow} label="Sincronizar ahora" variant="secondary" tall block /></div>}
            {connected && <div className="w-full sm:w-56"><ActionButton action={reloadAll} label="Recargar todo el historial" variant="secondary" tall block /></div>}
          </div>
        </div>
      </div>

      {!connected ? (
        <EmptyState title="Todavía no hay datos en vivo de Mercado Libre" description="Conectá la cuenta para ver ventas, publicaciones, visitas, preguntas y clientes actualizados solos." />
      ) : (
        <>
          <nav className="flex flex-wrap gap-1.5" aria-label="Secciones">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`?tab=${k}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
            ))}
          </nav>
          {tab === "resumen" && <SummaryTab db={mlDb} data={data!} />}
          {tab === "ventas" && <SalesTab sp={sp} db={mlDb} full />}
          {tab === "publicaciones" && <ItemsTab sp={sp} data={data!} />}
          {tab === "preguntas" && <QuestionsTab sp={sp} data={data!} company={db.settings.company} empresa={db.settings.name} />}
          {tab === "mensajes" && <MessagesTab sp={sp} data={data!} db={mlDb} />}
          {tab === "clientes" && <ClientsTab sp={sp} db={mlDb} />}
          {tab === "zonas" && <ZonesTab db={mlDb} />}
        </>
      )}
    </div>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof mlData>>>;

function PeriodNav({ sp, tab }: { sp: SearchParams; tab: string }) {
  const cur = param(sp, "p") || "hoy";
  return (
    <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Período">
      {RANGES.map((p) => (
        <Link key={p.value} href={`?tab=${tab}&p=${p.value}`} className={`rounded-full border px-2.5 py-0.5 ${p.value === cur ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{p.label}</Link>
      ))}
    </nav>
  );
}

/** Filtro simple por día para Preguntas y Mensajes: Hoy, Ayer o Todos (por defecto, Todos para no esconder pendientes viejos). */
const DAY_FILTERS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["todos", "Todos"]] as const;
const dayOf = (sp: SearchParams) => (DAY_FILTERS.find((x) => x[0] === param(sp, "d"))?.[0] ?? "todos");
const inDay = (d: string, date: string) => d === "todos" || date.slice(0, 10) === (d === "hoy" ? today() : isoDaysAgo(1));
function DayNav({ sp, tab }: { sp: SearchParams; tab: string }) {
  const cur = dayOf(sp);
  return (
    <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Día">
      {DAY_FILTERS.map(([k, label]) => {
        const u = new URLSearchParams();
        for (const [kk, vv] of Object.entries(sp)) if (kk !== "d" && kk !== "page" && kk !== "tab" && vv) u.set(kk, Array.isArray(vv) ? vv[0] : vv);
        u.set("tab", tab); u.set("d", k);
        return <Link key={k} href={`?${u}`} className={`rounded-full border px-3 py-1 ${k === cur ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>;
      })}
    </nav>
  );
}

function Bars({ rows, fmt = (n: number) => String(n) }: { rows: { label: string; value: number }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">Sin datos en el período.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-0.5 flex justify-between gap-2"><span className="md:truncate">{r.label}</span><span className="font-medium">{fmt(r.value)}</span></div>
          <div className="h-2 rounded bg-line"><div className="h-2 rounded bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const Panel = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-line bg-surface p-4 ${className}`}><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>
);

function SalesTab({ sp, db, full }: { sp: SearchParams; db: Db; full: boolean }) {
  const p = param(sp, "p") || "hoy";
  const { from, to } = range(p);
  const k = kpis(db, from, to);
  const inRange = db.sales.filter((s) => s.date >= from && s.date <= to);
  const refunded = inRange.filter((s) => s.status === "cancelada").length;
  const counted = inRange.filter((s) => s.status !== "cancelada");

  // Serie diaria de bruto y neto
  const byDay = new Map<string, { gross: number; net: number; units: number }>();
  for (const s of counted) { const t = saleTotals(db, s); const d = byDay.get(s.date) ?? { gross: 0, net: 0, units: 0 }; d.gross += t.revenue; d.net += t.net; d.units += t.units; byDay.set(s.date, d); }
  const days = [...byDay.keys()].sort();
  const label = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
  const products = byProduct(db, from, to);
  const topUnits = [...products].sort((a, b) => b.units - a.units).slice(0, 8);
  const topRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 8);


  return (
    <div className="space-y-4">
      <PeriodNav sp={sp} tab={full ? "ventas" : "resumen"} />
      <p className="text-center text-xs text-muted md:text-left">{fdate(from === "2000-01-01" ? (days[0] ?? today()) : from)} al {fdate(to)}</p>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Ventas" value={int(k.sales)} hint={refunded ? `${refunded} reembolsada${refunded === 1 ? "" : "s"} sin sumar` : undefined} />
        <KpiCard label="Unidades vendidas" value={int(k.units)} />
        <KpiCard label="Ticket promedio" value={money(k.ticket)} />
        <KpiCard label="Ingresos brutos" value={money(k.revenue)} />
        <KpiCard label="Cargos e impuestos" value={money(k.fees)} hint={k.revenue ? `${pct((k.fees / k.revenue) * 100)} del bruto` : undefined} />
        <KpiCard label="Ingresos netos" value={money(k.net)} hint="Total menos comisión de venta" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Productos más vendidos (unidades)"><Bars rows={topUnits.map((x) => ({ label: x.name, value: x.units }))} /></Panel>
        <Panel title="Productos que más facturan"><Bars rows={topRevenue.map((x) => ({ label: x.name, value: Math.round(x.revenue) }))} fmt={money} /></Panel>
      </section>
      {full && (
        <DataTable
          rows={[...counted].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)} rowKey={(s) => s.id}
          columns={[
            { key: "d", header: "Fecha", render: (s) => fdate(s.date) }, { key: "o", header: "Orden", render: (s) => <span className="font-mono text-xs">{s.mlOrderId ?? "—"}</span> },
            { key: "b", header: "Bruto", align: "right", render: (s) => money(saleTotals(db, s).revenue) }, { key: "c", header: "Cargos", align: "right", render: (s) => money(saleTotals(db, s).fees) },
            { key: "n", header: "Neto", align: "right", render: (s) => money(saleTotals(db, s).net) },
          ]}
        />
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ingresos brutos por día">{days.length ? <Chart color={ML_BLUE} format="money" name="Ingresos brutos" data={days.map((d) => ({ label: label(d), value: Math.round(byDay.get(d)!.gross) }))} /> : <p className="text-sm text-muted">Sin ventas en el período.</p>}</Panel>
        <Panel title="Ingresos netos por día">{days.length ? <Chart color={ML_BLUE} format="money" name="Ingresos netos" data={days.map((d) => ({ label: label(d), value: Math.round(byDay.get(d)!.net) }))} /> : <p className="text-sm text-muted">Sin ventas en el período.</p>}</Panel>
        <Panel title="Unidades vendidas por día" className="lg:col-span-2">{days.length ? <Chart color={ML_BLUE} type="bar" name="Unidades" data={days.map((d) => ({ label: label(d), value: byDay.get(d)!.units }))} /> : <p className="text-sm text-muted">Sin ventas en el período.</p>}</Panel>
      </section>
    </div>
  );
}

/** Tiempo transcurrido entre dos fechas (AAAA-MM-DD): años, meses y días completos, y días en total. */
function elapsed(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number), [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm), days = td - fd;
  if (days < 0) { months--; days += new Date(Date.UTC(ty, tm - 1, 0)).getUTCDate(); }
  const total = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
  return { years: Math.floor(months / 12), months: months % 12, days, total };
}

/** Resumen: todo el historial de la cuenta, sin filtros de fecha. El detalle por período está en la solapa Ventas. */
function SummaryTab({ db, data }: { db: Db; data: Data }) {
  const k = kpis(db, "2000-01-01", today());
  const company = db.settings.company ?? {};
  const counted = db.sales.filter((s) => s.status !== "cancelada");
  const byMonth = new Map<string, { gross: number; net: number; units: number }>();
  for (const s of counted) {
    const t = saleTotals(db, s), m = s.date.slice(0, 7);
    const c = byMonth.get(m) ?? { gross: 0, net: 0, units: 0 };
    c.gross += t.revenue; c.net += t.net; c.units += t.units;
    byMonth.set(m, c);
  }
  const months = [...byMonth.keys()].sort();
  const mLabel = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;
  const products = byProduct(db, "2000-01-01", today());
  const topUnits = [...products].sort((a, b) => b.units - a.units).slice(0, 8);
  const topRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const unanswered = data.questions.filter((q) => q.status === "UNANSWERED").length;
  const active = data.items.filter((i) => i.status === "active").length;
  const rep = data.reputation;
  const first = counted.map((s) => s.date).sort()[0];

  return (
    <div className="space-y-4">
      <p>
        {first && (() => {
          const t = elapsed(first, today());
          const parts = [t.years ? `${t.years} año${t.years === 1 ? "" : "s"}` : "", t.months ? `${t.months} mes${t.months === 1 ? "" : "es"}` : "", `${t.days} día${t.days === 1 ? "" : "s"}`].filter(Boolean);
          return <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary"><svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .3.7l2.5 2.5a1 1 0 0 0 1.4-1.4L11 9.6V6Z" clipRule="evenodd" /></svg>Desde el {fdate(first)} · llevamos {parts.join(", ")} · {int(t.total)} días en total</span>;
        })()}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {rep && (() => {
          const stars = Math.floor(rep.positive * 50) / 10; // 99 % de calificaciones positivas = 4,9 de 5
          return (
            <span title="Puntuación calculada con el porcentaje de calificaciones positivas de tus ventas (Mercado Libre no entrega estrellas de vendedor)" className="inline-flex items-center gap-2 rounded-full border border-[#f59e0b]/40 bg-[#fef3c7] px-3 py-1 text-xs font-semibold text-[#92400e]">
              <span className="relative inline-block text-base leading-none tracking-tight" aria-label={`${stars} de 5 estrellas`}>
                <span className="text-[#92400e]/25">★★★★★</span>
                <span className="absolute inset-y-0 left-0 overflow-hidden text-[#f59e0b]" style={{ width: `${(stars / 5) * 100}%` }}>★★★★★</span>
              </span>
              <span>{stars.toFixed(1).replace(".", ",")} de 5</span>
              <span className="font-medium opacity-80">· {pct(rep.positive * 100)} positivas</span>
              {rep.points != null && <span className="font-medium opacity-80">· {rep.points} puntos</span>}
            </span>
          );
        })()}
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink" title="Mercado Libre no informa los seguidores: se cargan a mano desde tu perfil público">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          {company.mlFollowers != null ? <><span className="text-sm tabular-nums">{int(company.mlFollowers)}</span> seguidores{company.mlFollowersAt && <span className="font-medium text-muted">· al {fdate(company.mlFollowersAt)}</span>}</> : <span className="font-medium text-muted">Seguidores sin cargar</span>}
        </span>
        <CreateDrawer
          compact buttonLabel="Actualizar seguidores" variant="secondary" title="Seguidores de la cuenta" action={saveMlFollowers}
          fields={[{ name: "followers", label: "Seguidores hoy", type: "number", required: true, defaultValue: company.mlFollowers != null ? String(company.mlFollowers) : "", help: "Mercado Libre no informa este número por su API: miralo en tu perfil público y cargalo acá. Queda guardado con la fecha." }]}
        />
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ventas (histórico)" value={int(k.sales)} />
        <KpiCard label="Unidades vendidas (histórico)" value={int(k.units)} />
        <KpiCard label="Ticket promedio" value={money(k.ticket)} />
        <KpiCard label="Visitas (histórico)" value={data.visitsTotal != null ? int(data.visitsTotal) : "—"} hint={data.visitsTotal ? `Conversión ${pct((k.sales / data.visitsTotal) * 100)}` : undefined} />
        <KpiCard label="Ingresos brutos (histórico)" value={money(k.revenue)} />
        <KpiCard label="Cargos e impuestos (histórico)" value={money(k.fees)} hint={k.revenue ? `${pct((k.fees / k.revenue) * 100)} del bruto` : undefined} />
        <KpiCard label="Ingresos netos (histórico)" value={money(k.net)} hint="Total menos comisión de venta" />
        <KpiCard label="Publicaciones activas" value={`${active} de ${data.items.length}`} hint={unanswered ? `${unanswered} pregunta${unanswered === 1 ? "" : "s"} sin responder` : "Preguntas al día"} />
      </section>

      {rep && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">Reputación histórica <Badge tone={REPUTATION[rep.level]?.tone ?? "neutral"}>{REPUTATION[rep.level]?.label ?? (rep.level || "Sin dato")}</Badge></h3>
          <Guide className="mb-3" title="¿Por qué no cambia con las fechas?">Histórico de la cuenta de Mercado Libre: no cambia con el filtro de fechas (Hoy, Ayer, Últimos 7 días…).</Guide>
          <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
            <div><p className="text-xs uppercase text-muted">Calificaciones positivas (histórico)</p><p className="text-lg font-semibold">{pct(rep.positive * 100)}</p></div>
            <div><p className="text-xs uppercase text-muted">Ventas completadas (histórico)</p><p className="text-lg font-semibold">{int(rep.completed)}</p></div>
            <div><p className="text-xs uppercase text-muted">Canceladas (histórico)</p><p className="text-lg font-semibold">{int(rep.canceled)}</p></div>
            <div><p className="text-xs uppercase text-muted">Reclamos (365 d)</p><p className="text-lg font-semibold">{pct(rep.claimsRate * 100)}</p></div>
            <div><p className="text-xs uppercase text-muted">Demoras de despacho</p><p className="text-lg font-semibold">{pct(rep.delayedRate * 100)}</p></div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ingresos por mes (bruto)">{months.length ? <Chart color={ML_BLUE} format="money" name="Ingresos brutos" data={months.map((m) => ({ label: mLabel(m), value: Math.round(byMonth.get(m)!.gross) }))} /> : <p className="text-sm text-muted">Sin datos.</p>}</Panel>
        <Panel title="Ingresos por mes (neto)">{months.length ? <Chart color={ML_BLUE} format="money" name="Ingresos netos" data={months.map((m) => ({ label: mLabel(m), value: Math.round(byMonth.get(m)!.net) }))} /> : <p className="text-sm text-muted">Sin datos.</p>}</Panel>
        <Panel title="Unidades vendidas por mes">{months.length ? <Chart color={ML_BLUE} type="bar" name="Unidades" data={months.map((m) => ({ label: mLabel(m), value: byMonth.get(m)!.units }))} /> : <p className="text-sm text-muted">Sin datos.</p>}</Panel>
        <Panel title="Visitas por día (últimos 30 días)">{data.visitsDaily.length ? <Chart color={ML_BLUE} name="Visitas" data={data.visitsDaily.map((v) => ({ label: `${v.date.slice(8)}/${v.date.slice(5, 7)}`, value: v.total }))} /> : <p className="text-sm text-muted">Sin datos.</p>}</Panel>
        <Panel title="Productos más vendidos (unidades, histórico)"><Bars rows={topUnits.map((x) => ({ label: x.name, value: x.units }))} /></Panel>
        <Panel title="Productos que más facturan (histórico)"><Bars rows={topRevenue.map((x) => ({ label: x.name, value: Math.round(x.revenue) }))} fmt={money} /></Panel>
      </section>
    </div>
  );
}

const STATUS_RANK: Record<string, number> = { active: 0, under_review: 1, paused: 2 };

function ItemsTab({ sp, data }: { sp: SearchParams; data: Data }) {
  const q = param(sp, "q"), status = param(sp, "is");
  const counts = new Map<string, number>();
  for (const i of data.items) counts.set(i.status, (counts.get(i.status) ?? 0) + 1);
  const filtered = data.items.filter((i) => matches(q, i.title, i.id) && (!status || i.status === status))
    // Orden fijo: activas, en revisión, pausadas y el resto; dentro de cada grupo, primero las que más venden y más visitas tienen.
    .sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || b.sold - a.sold || b.visits - a.visits);
  const { rows, page, pages, total } = paginate(filtered, sp);
  const stock = data.items.filter((i) => i.status === "active").reduce((s, i) => s + i.available, 0);
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Publicaciones" value={int(data.items.length)} />
        <KpiCard label="Activas" value={int(counts.get("active") ?? 0)} />
        <KpiCard label="Pausadas / otras" value={int(data.items.length - (counts.get("active") ?? 0))} hint={[...counts].filter(([k]) => k !== "active").map(([k, n]) => `${ITEM_STATUS[k]?.label ?? k}: ${n}`).join(" · ") || undefined} />
        <KpiCard label="Stock publicado" value={int(stock)} hint="Unidades en publicaciones activas" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Más vendidas (unidades históricas)"><Bars rows={[...data.items].sort((a, b) => b.sold - a.sold).slice(0, 8).map((i) => ({ label: i.title, value: i.sold }))} /></Panel>
        <Panel title="Más visitadas (30 días)"><Bars rows={[...data.items].sort((a, b) => b.visits - a.visits).slice(0, 8).map((i) => ({ label: i.title, value: i.visits }))} /></Panel>
      </section>
      <Guide title="¿Qué significan los íconos de las publicaciones?"><span className="mb-1 flex justify-center"><ListingFlags item={{ promo: "ejemplo", ads: true }} /></span> Los íconos marcan las publicaciones con <strong>promoción especial</strong> (etiqueta naranja) y con <strong>publicidad paga</strong> (megáfono violeta). Pasá el mouse por encima para ver el detalle.</Guide>
      <Filters sp={{ ...sp, tab: "publicaciones" }} searchPlaceholder="Buscar publicación" filters={[{ name: "is", label: "Estado", options: Object.entries(ITEM_STATUS).map(([value, v]) => ({ value, label: v.label })) }]} />
      <DataTable
        rows={rows} rowKey={(i) => i.id} emptyTitle="Sin publicaciones"
        columns={[
          { key: "t", header: "Publicación", render: (i) => <div><a href={i.permalink} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{i.title}</a><p className="font-mono text-xs text-muted">{i.id}</p></div> },
          { key: "s", header: "Estado", render: (i) => <div className="flex flex-col items-start gap-1"><Badge fixed tone={ITEM_STATUS[i.status]?.tone ?? "neutral"}>{ITEM_STATUS[i.status]?.label ?? i.status}</Badge><ListingFlags item={i} /></div> },
          { key: "p", header: "Precio", align: "right", render: (i) => <div>{money(i.price)}{i.originalPrice && i.originalPrice > i.price && <p className="text-xs text-muted line-through">{money(i.originalPrice)}</p>}</div> },
          { key: "a", header: "Stock", align: "right", render: (i) => (i.available <= 3 && i.status === "active" ? <Badge tone="warning">{i.available}</Badge> : i.available) },
          { key: "v", header: "Vendidas", align: "right", render: (i) => int(i.sold) },
          { key: "vi", header: "Visitas", align: "right", render: (i) => int(i.visits) },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}

function QuestionsTab({ sp, data, company, empresa }: { sp: SearchParams; data: Data; company: Db["settings"]["company"]; empresa: string }) {
  const q = param(sp, "q"), status = param(sp, "qs");
  const titles = new Map(data.items.map((i) => [i.id, i.title]));
  const day = dayOf(sp);
  const all = data.questions.filter((x) => inDay(day, x.created));
  const answered = all.filter((x) => x.hoursToAnswer != null);
  const avg = answered.length ? answered.reduce((s, x) => s + (x.hoursToAnswer ?? 0), 0) / answered.length : 0;
  const filtered = all.filter((x) => matches(q, x.text, x.answer ?? "", titles.get(x.itemId)) && (!status || x.status === status));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const byItem = new Map<string, number>();
  for (const x of all) byItem.set(x.itemId, (byItem.get(x.itemId) ?? 0) + 1);
  return (
    <div className="space-y-4">
      <DayNav sp={sp} tab="preguntas" />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Preguntas" value={int(all.length)} />
        <KpiCard label="Sin responder" value={int(all.filter((x) => x.status === "UNANSWERED").length)} />
        <KpiCard label="Respondidas" value={int(all.filter((x) => x.status === "ANSWERED").length)} />
        <KpiCard label="Tiempo medio de respuesta" value={avg ? (avg < 48 ? `${avg.toFixed(1).replace(".", ",")} h` : `${(avg / 24).toFixed(1).replace(".", ",")} días`) : "—"} />
      </section>
      <Panel title="Publicaciones que más preguntas reciben"><Bars rows={[...byItem].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ label: titles.get(id) ?? id, value: n }))} /></Panel>
      <Filters sp={{ ...sp, tab: "preguntas" }} searchPlaceholder="Buscar en preguntas y respuestas" filters={[{ name: "qs", label: "Estado", options: Object.entries(Q_STATUS).map(([value, v]) => ({ value, label: v.label })) }]} />
      <DataTable
        rows={rows} rowKey={(x) => x.id} emptyTitle="Sin preguntas"
        columns={[
          { key: "d", header: "Fecha", render: (x) => fdate(x.created) },
          { key: "i", header: "Publicación", render: (x) => <span className="text-xs">{titles.get(x.itemId) ?? x.itemId}</span> },
          { key: "q", header: "Pregunta", render: (x) => <div><p>{x.text}</p>{x.answer && <p className="mt-1 text-xs text-muted">↳ {x.answer}</p>}</div> },
          { key: "s", header: "Estado", render: (x) => <Badge fixed tone={Q_STATUS[x.status]?.tone ?? "neutral"}>{Q_STATUS[x.status]?.label ?? x.status}</Badge> },
          {
            key: "r", header: "", render: (x) => x.status === "UNANSWERED" && (
              <CreateDrawer
                buttonLabel="Responder" title="Responder pregunta" action={answerQuestion.bind(null, x.id)}
                fields={[
                  { name: "pregunta", label: "Pregunta del comprador", defaultValue: x.text, type: "textarea", readOnly: true },
                  { name: "text", label: "Tu respuesta", type: "textarea", required: true, maxLength: 2000, placeholder: "Escribí la respuesta…", quick: quickForQuestion(company, empresa, { productos: titles.get(x.itemId) ?? "" }) },
                ]}
              />
            ),
          },
          { key: "t", header: "Respuesta en", align: "right", render: (x) => (x.hoursToAnswer == null ? "—" : x.hoursToAnswer < 48 ? `${x.hoursToAnswer.toFixed(1).replace(".", ",")} h` : `${(x.hoursToAnswer / 24).toFixed(1).replace(".", ",")} d`) },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}

function ZonesTab({ db }: { db: Db }) {
  const byCity = new Map<string, number>();
  for (const c of db.customers.filter((x) => x.id.startsWith("mlb_") && db.sales.some((s) => s.customerId === x.id && s.status !== "cancelada"))) {
    const city = c.city?.split(",").pop()?.trim() || "Sin dato";
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }
  return <Panel title="De dónde compran (provincia)"><Bars rows={[...byCity].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value }))} /></Panel>;
}

function ClientsTab({ sp, db }: { sp: SearchParams; db: Db }) {
  const q = param(sp, "q");
  const buyers = db.customers.filter((c) => c.id.startsWith("mlb_"));
  const stats = buyers.map((c) => {
    const sales = db.sales.filter((s) => s.customerId === c.id && s.status !== "cancelada");
    const gross = sales.reduce((t, s) => t + saleTotals(db, s).revenue, 0);
    const net = sales.reduce((t, s) => t + saleTotals(db, s).net, 0);
    // Qué compró: cada producto con la cantidad total de unidades.
    const bought = new Map<string, number>();
    for (const s of sales) for (const i of s.items) bought.set(i.productId, (bought.get(i.productId) ?? 0) + i.qty);
    return { c, count: sales.length, gross, net, last: sales.map((s) => s.date).sort().at(-1) ?? "", bought: [...bought].map(([id, qty]) => ({ name: db.products.find((p) => p.id === id)?.name ?? "Producto", qty })) };
  }).filter((x) => x.count > 0);
  const recurring = stats.filter((x) => x.count >= 2);
  const filtered = stats.filter((x) => matches(q, x.c.name, x.c.nickname, x.c.city)).sort((a, b) => b.last.localeCompare(a.last) || b.net - a.net);
  const { rows, page, pages, total } = paginate(filtered, sp);
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Compradores" value={int(stats.length)} />
        <KpiCard label="Recurrentes (2 o más compras)" value={int(recurring.length)} hint={stats.length ? `${pct((recurring.length / stats.length) * 100)} del total` : undefined} />
        <KpiCard label="Compra promedio" value={money(stats.length ? stats.reduce((s, x) => s + x.net, 0) / stats.length : 0)} hint="Neto por comprador" />
        <KpiCard label="Mejor comprador" value={money(Math.max(0, ...stats.map((x) => x.net)))} hint="Neto acumulado" />
      </section>
      <Guide title="¿Qué datos entrega Mercado Libre de cada comprador?">
        Solo el apodo, la ciudad y la provincia públicas, y el historial de compras. Mercado Libre no informa nombre real, teléfono ni email por su política de privacidad.
      </Guide>
      <Filters sp={{ ...sp, tab: "clientes" }} searchPlaceholder="Buscar por apodo o ciudad" />
      <DataTable
        rows={rows} rowKey={(x) => x.c.id} emptyTitle="Sin compradores"
        columns={[
          { key: "n", header: "Comprador", render: (x) => (
            <div>
            {x.c.full || x.c.nickname ? (
              <div>
                <p className="flex items-center gap-2 font-medium">{x.c.name}</p>
                <a href={`https://perfil.mercadolibre.com.ar/${encodeURIComponent(x.c.nickname || x.c.name)}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Usuario ML: {x.c.nickname || x.c.name}</a>
              </div>
            ) : (
              <a href={`https://perfil.mercadolibre.com.ar/${encodeURIComponent(x.c.name)}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{x.c.name}</a>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              {x.bought.slice(0, 2).map((b) => (
                <span key={b.name} title={`${b.qty} × ${b.name}`} className="inline-flex max-w-[15rem] items-center gap-1 truncate rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted"><span className="font-semibold text-ink">{b.qty}×</span><span className="truncate">{b.name}</span></span>
              ))}
              {x.bought.length > 2 && <span title={x.bought.slice(2).map((b) => `${b.qty} × ${b.name}`).join("\n")} className="rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">+{x.bought.length - 2}</span>}
            </div>
            </div>
          ) },
          { key: "ci", header: "Ubicación", render: (x) => x.c.city || "—" },
          { key: "co", header: "Compras", align: "right", render: (x) => (x.count >= 2 ? <Badge tone="success">{x.count}</Badge> : x.count) },
          { key: "g", header: "Bruto", align: "right", render: (x) => money(x.gross) },
          { key: "ne", header: "Neto", align: "right", render: (x) => money(x.net) },
          { key: "l", header: "Última compra", render: (x) => fdate(x.last) },
          {
            key: "a", header: "", render: (x) => (
              <div className="flex items-center justify-end gap-2">
              <ContactButtons name={x.c.name} phone={x.c.phone} email={x.c.email} />
              <CreateDrawer
                buttonLabel="Editar" variant="secondary"
                title={x.c.full ? `Editar: ${x.c.name}` : `Completar los datos de ${x.c.name}`} action={saveCustomerData.bind(null, x.c.id)}
                fields={[
                  ...(mlUserOf(x.c) ? [{ name: "mlUser", label: "Usuario de Mercado Libre", defaultValue: mlUserOf(x.c), readOnly: true, help: "Queda siempre guardado: no se modifica." }] : []),
                  { name: "name", label: "Nombre y apellido reales", defaultValue: !looksLikeUser(x.c) ? x.c.name : "", placeholder: "Escribí el nombre real" },
                  { name: "phone", label: "Teléfono", defaultValue: x.c.phone },
                  { name: "email", label: "Email", type: "email", defaultValue: x.c.email },
                  { name: "address", label: "Domicilio", defaultValue: x.c.address },
                  { name: "city", label: "Ciudad y provincia", defaultValue: x.c.city },
                  { name: "doc", label: "DNI / CUIT", defaultValue: x.c.doc },
                  { name: "company", label: "Empresa (opcional)", defaultValue: x.c.company },
                  { name: "notes", label: "Notas", type: "textarea", defaultValue: x.c.notes },
                ]}
              />
              </div>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}

function MessagesTab({ sp, data, db }: { sp: SearchParams; data: Data; db: Db }) {
  const q = param(sp, "q"), turn = param(sp, "turn");
  const day = dayOf(sp);
  const nameOf = (id: string) => db.customers.find((c) => c.id === `mlb_${id}`)?.name ?? `Comprador ${id}`;

  // Una fila por conversación (orden): el historial completo queda dentro y se abre con un toque.
  const byOrder = new Map<string, Data["messages"]>();
  for (const m of data.messages) byOrder.set(m.orderId, [...(byOrder.get(m.orderId) ?? []), m]);
  const convs = [...byOrder].filter(([orderId]) => orderId).map(([orderId, list]) => {
    const msgs = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = msgs[msgs.length - 1];
    const buyerId = msgs.find((m) => m.fromBuyer)?.fromId ?? "";
    return { orderId, msgs, last, buyerId, myTurn: last.fromBuyer, unread: msgs.filter((m) => m.fromBuyer && !m.read).length };
  }).sort((a, b) => b.last.date.localeCompare(a.last.date));

  const inDayConvs = convs.filter((c) => inDay(day, c.last.date));
  const filtered = inDayConvs.filter((c) => (matches(q, c.orderId, nameOf(c.buyerId), ...c.msgs.map((m) => m.text))) && (!turn || (turn === "mine" ? c.myTurn : !c.myTurn)));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const preview = (t: string) => (t.trim() ? t : "(mensaje vacío o adjunto)");

  return (
    <div className="space-y-4">
      <DayNav sp={sp} tab="mensajes" />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Conversaciones" value={int(inDayConvs.length)} hint="Una por orden, con todo el historial adentro" />
        <KpiCard label="Te toca responder" value={int(inDayConvs.filter((c) => c.myTurn).length)} hint="El último mensaje es del comprador" />
        <KpiCard label="Mensajes sin leer" value={int(inDayConvs.reduce((s, c) => s + c.unread, 0))} hint="De compradores" />
        <KpiCard label="Mensajes en total" value={int(inDayConvs.reduce((s, c) => s + c.msgs.length, 0))} />
      </section>
      <Guide title="¿De dónde salen los datos de contacto?">
        Mercado Libre no entrega teléfono ni domicilio por su cuenta, pero los compradores suelen escribirlos en sus mensajes después de comprar. Acá quedan guardados para que los tengas a mano.
      </Guide>
      <Filters sp={{ ...sp, tab: "mensajes" }} searchPlaceholder="Buscar en las conversaciones (teléfono, domicilio, orden, comprador…)" filters={[{ name: "turn", label: "Turno", options: [{ value: "mine", label: "Te toca responder" }, { value: "theirs", label: "Esperando al comprador" }] }]} />
      <DataTable
        rows={rows} rowKey={(c) => c.orderId} emptyTitle="Sin conversaciones" emptyDescription="Aparecen apenas llegan o cuando termina la sincronización."
        columns={[
          { key: "d", header: "Último mensaje", render: (c) => fdate(c.last.date) },
          { key: "f", header: "Comprador", render: (c) => <div><p className="font-medium">{nameOf(c.buyerId)}</p><p className="font-mono text-xs text-muted">{c.orderId}</p></div> },
          {
            key: "t", header: "Conversación", render: (c) => (
              <details className="group max-w-xl">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <p className="whitespace-pre-wrap"><span className="text-xs font-semibold text-muted">{c.last.fromBuyer ? "Comprador: " : "Vos: "}</span>{preview(c.last.text)}</p>
                  <p className="mt-1 text-xs text-primary">{c.msgs.length} mensaje{c.msgs.length === 1 ? "" : "s"} · <span className="group-open:hidden">Ver toda la charla</span><span className="hidden group-open:inline">Ocultar</span></p>
                </summary>
                <ul className="mt-2 space-y-2 border-l-2 border-line pl-3">
                  {c.msgs.map((m) => (
                    <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.fromBuyer ? "bg-bg" : "bg-primary/10"}`}>
                      <p className="mb-0.5 text-xs text-muted"><strong>{m.fromBuyer ? nameOf(m.fromId) : "Negocio"}</strong> · {fdate(m.date)}</p>
                      <p className="whitespace-pre-wrap">{preview(m.text)}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ),
          },
          { key: "s", header: "Estado", render: (c) => (c.myTurn ? <Badge fixed="wide" tone="warning">Te toca responder</Badge> : <Badge fixed="wide">Esperando al comprador</Badge>) },
          {
            key: "a", header: "", render: (c) => c.buyerId && (
              <CreateDrawer
                buttonLabel="Responder" variant={c.myTurn ? "primary" : "secondary"} title={`Responder a ${nameOf(c.buyerId)}`} action={replyToBuyer.bind(null, c.orderId, c.buyerId)}
                fields={[
                  { name: "ultimo", label: "Último mensaje", defaultValue: preview(c.last.text), type: "textarea", readOnly: true },
                  { name: "text", label: "Tu respuesta (máximo 350 por mensaje; para mandar varios, separalos con una línea ---)", type: "textarea", required: true, maxLength: 800, placeholder: "Escribí tu respuesta…" },
                ]}
              />
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}
