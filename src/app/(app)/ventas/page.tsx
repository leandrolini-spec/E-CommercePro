import { AutoSubmit } from "@/components/shared/AutoSubmit";
import { ManualSale } from "@/components/shared/ManualSale";
import { Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import Link from "next/link";
import { Badge, KpiCard, type Tone } from "@/components/ui/primitives";
import { fdate, money, pct } from "@/lib/format";
import { saleTotals } from "@/modules/calc";
import { CANCEL_REASONS, cancelReasons, reasonLabel } from "@/modules/cancel-reasons";
import { setCancelReason } from "@/modules/cancel-reasons-actions";
import { getDb } from "@/modules/data";
import { NewBuyersTab } from "@/components/shared/NewBuyers";
import { hrefWith, PeriodTabs, rangeOf } from "@/components/shared/period";
import { mlMessagesFor } from "@/integrations/mercadolibre/data";
import { setRefundDone } from "@/modules/actions";
import { inAgenda, isWelcomed } from "@/modules/customers";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import type { Db, Sale } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const SALE_TONE: Record<string, Tone> = { pendiente: "warning", preparando: "info", enviado: "info", entregado: "success", cancelada: "danger" };

function HistorialTab({ sp, db }: { sp: SearchParams; db: Db }) {
  // Una venta "pendiente" muestra en qué va su envío: preparando (empaquetado), enviado (en viaje) o entregado.
  const shownStatus = (s: Sale) => {
    if (s.status !== "pendiente") return s.status;
    const stage = db.shipments?.find((x) => x.saleId === s.id)?.stage;
    return stage === "preparado" || stage === "empaquetado" ? "preparando" : stage === "en_viaje" ? "enviado" : stage === "entregado" ? "entregado" : "pendiente";
  };
  const q = param(sp, "q"), channel = param(sp, "channel"), status = param(sp, "status"), from = param(sp, "from"), to = param(sp, "to");
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const filtered = [...db.sales]
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
    .filter((s) => matches(q, cust(s.customerId), db.customers.find((c) => c.id === s.customerId)?.nickname, s.number, `V-${s.number}`, s.mlOrderId, prodsOf(db, s), s.channel) && (!channel || s.channel === channel) && (!status || shownStatus(s) === status) && (!from || s.date >= from) && (!to || s.date <= to));
  const valid = filtered.filter((s) => s.status !== "cancelada").map((s) => saleTotals(db, s));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const dates = filtered.map((s) => s.date).sort();
  const periodo = dates.length ? `Cifras de todas las ventas desde el ${fdate(dates[0])} hasta el ${fdate(dates[dates.length - 1])} (${filtered.length} ventas, con los filtros aplicados)` : "Sin ventas para estos filtros";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{`Margen y resultado por venta. ${periodo}`}</p>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Facturación bruta" value={money(valid.reduce((s, x) => s + x.revenue, 0))} hint={`Neto cobrado ${money(valid.reduce((s, x) => s + x.net, 0))}`} />
        <KpiCard label="Margen bruto" value={money(valid.reduce((s, x) => s + x.margin, 0))} />
        <KpiCard label="Resultado estimado" value={money(valid.reduce((s, x) => s + x.result, 0))} hint="Margen menos cargos y gastos asociados" />
        <KpiCard label="Cantidad" value={String(valid.length)} />
      </section>
      <Filters sp={sp} dates searchPlaceholder="Buscar por cliente, usuario, N.º de venta u orden, o producto" filters={[
        { name: "channel", label: "Canal", options: db.settings.channels },
        { name: "status", label: "Estado", options: ["pendiente", "preparando", "enviado", "entregado", "cancelada"] },
      ]} />
      <DataTable
        rows={rows} rowKey={(s) => s.id}
        columns={[
          { key: "n", header: "N.º", render: (s) => `V-${s.number}` },
          { key: "d", header: "Fecha", render: (s) => fdate(s.date) },
          { key: "c", header: "Cliente", render: (s) => cust(s.customerId) },
          { key: "ch", header: "Canal", render: (s) => s.channel },
          { key: "r", header: "Venta", align: "right", render: (s) => money(saleTotals(db, s).revenue) },
          { key: "co", header: "Costo", align: "right", render: (s) => money(saleTotals(db, s).cost) },
          { key: "fe", header: "Cargos", align: "right", render: (s) => { const f = saleTotals(db, s).fees; return f > 0 ? money(f) : "—"; } },
          { key: "ne", header: "Neto", align: "right", render: (s) => money(saleTotals(db, s).net) },
          { key: "m", header: "Margen", align: "right", render: (s) => { const t = saleTotals(db, s); return <span>{money(t.margin)} <span className="text-xs text-muted">({pct(t.marginPct)})</span></span>; } },
          { key: "re", header: "Resultado", align: "right", render: (s) => money(saleTotals(db, s).result) },
          { key: "st", header: "Estado", render: (s) => { const st = shownStatus(s); return <div className="flex flex-wrap gap-1"><Badge fixed tone={SALE_TONE[st]}>{s.status === "cancelada" && s.payStatus === "reembolsada" ? "reembolsada" : st}</Badge>{s.payStatus === "reclamo" && <Badge fixed tone="warning">Reclamo abierto</Badge>}</div>; } },
          { key: "ml", header: "Orden ML", render: (s) => (s.mlOrderId ? <span className="font-mono text-xs">{s.mlOrderId}</span> : "—") },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}

const TABS = [["compradores", "Nuevos compradores"], ["historial", "Historial de ventas"], ["reclamos", "Reclamos"], ["reembolsar", "Reembolsar"]] as const;

const amountOf = (db: Db, s: Sale) => saleTotals({ ...db, sales: [{ ...s, status: "pendiente" }] }, { ...s, status: "pendiente" }).revenue;
const prodsOf = (db: Db, s: Sale) => s.items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)?.name ?? "Producto"}`).join(" · ");

/** Estado del reclamo de cada orden de Mercado Libre con mediación: abierto, cerrado o sin confirmar (si no se pudo consultar). */
async function claimStates(): Promise<Map<string, "opened" | "closed" | "unknown">> {
  const out = new Map<string, "opened" | "closed" | "unknown">();
  if (!isSupabase()) return out;
  const pid = await activeProjectId();
  const [{ data: orders }, { data: claims }] = await Promise.all([
    service().from("ml_resources").select("ml_id,mediations:data->mediations").eq("project_id", pid).eq("kind", "order"),
    service().from("ml_resources").select("ml_id,status:data->>status").eq("project_id", pid).eq("kind", "claim"),
  ]);
  const byClaim = new Map((claims ?? []).map((c) => [String(c.ml_id), String(c.status)]));
  for (const o of orders ?? []) {
    if (!Array.isArray(o.mediations) || !o.mediations.length) continue;
    const st = (o.mediations as { id: number | string }[]).map((m) => byClaim.get(String(m.id)) ?? "unknown");
    out.set(String(o.ml_id), st.includes("opened") ? "opened" : st.includes("unknown") ? "unknown" : "closed");
  }
  return out;
}

type ClaimRow = { id: string; orderId: string; status: string; created: string; updated: string };
/** Todos los reclamos de Mercado Libre (abiertos y cerrados) con su fecha de última novedad: es el historial que alimenta los contadores por período. */
async function claimHistory(): Promise<ClaimRow[]> {
  if (!isSupabase()) return [];
  const { data } = await service().from("ml_resources").select("id:ml_id,orderId:data->>resource_id,status:data->>status,created:data->>date_created,updated:data->>last_updated").eq("project_id", await activeProjectId()).eq("kind", "claim");
  return (data ?? []).map((c) => ({ id: String(c.id), orderId: String(c.orderId ?? ""), status: String(c.status ?? ""), created: String(c.created ?? "").slice(0, 10), updated: String(c.updated ?? c.created ?? "").slice(0, 10) }));
}

function ClaimsTab({ db, claims, history, range }: { db: Db; claims: Map<string, "opened" | "closed" | "unknown">; history: ClaimRow[]; range: { from: string; to: string; label: string } }) {
  const stateOf = (s: Sale) => (s.mlOrderId ? claims.get(s.mlOrderId) : undefined);
  // Solo los reclamos abiertos (o que no se pudieron confirmar); los que Mercado Libre ya cerró no figuran.
  const rows = db.sales.filter((s) => s.status !== "cancelada" && s.payStatus !== "reembolsada" && (s.payStatus === "reclamo" || stateOf(s) === "opened" || stateOf(s) === "unknown")).sort((a, b) => b.date.localeCompare(a.date));
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const inRange = history.filter((h) => h.updated >= range.from && h.updated <= range.to).sort((a, b) => b.updated.localeCompare(a.updated));
  const saleOf = (h: ClaimRow) => db.sales.find((x) => x.mlOrderId === h.orderId);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Historial de reclamos · {range.label} ({inRange.length})</h2>
        <Guide title="¿Qué muestra este historial?">Todos los reclamos del período, abiertos o ya cerrados por Mercado Libre. Quedan acá aunque ya estén resueltos.</Guide>
        <DataTable
          rows={inRange} rowKey={(h) => h.id} emptyTitle="Sin reclamos en este período" emptyDescription="Probá con otro período."
          columns={[
            { key: "d", header: "Última novedad", render: (h) => fdate(h.updated) },
            { key: "o", header: "Venta", render: (h) => (saleOf(h) ? `V-${saleOf(h)!.number}` : "—") },
            { key: "c", header: "Comprador", render: (h) => (saleOf(h) ? cust(saleOf(h)!.customerId) : "—") },
            { key: "p", header: "Producto", render: (h) => <span className="block max-w-64 text-xs">{saleOf(h) ? prodsOf(db, saleOf(h)!) : "—"}</span> },
            { key: "r", header: "Resultado", render: (h) => (h.status === "closed" ? (saleOf(h)?.payStatus === "reembolsada" || saleOf(h)?.status === "cancelada" ? <Badge tone="danger">Cerrado · reembolsada</Badge> : <Badge tone="success">Cerrado</Badge>) : <Badge tone="warning">Abierto</Badge>) },
            { key: "n", header: "N.º de reclamo", render: (h) => <span className="font-mono text-xs">{h.id}</span> },
          ]}
        />
      </section>
      <section className="space-y-2">
      <h2 className="text-sm font-semibold">Abiertos ahora ({rows.length})</h2>
      <Guide title="¿Cómo funcionan los reclamos abiertos?">Ventas con un reclamo o mediación abierta en Mercado Libre y todavía sin reembolsar. Si el reclamo termina en devolución, la venta pasa sola a <strong>Reembolsar</strong>.</Guide>
      <DataTable
        rows={rows} rowKey={(s) => s.id} emptyTitle="Sin reclamos abiertos" emptyDescription="Las ventas con reclamo aparecen solas cuando Mercado Libre abre uno."
        columns={[
          { key: "n", header: "N.º", render: (s) => `V-${s.number}` },
          { key: "d", header: "Fecha", render: (s) => fdate(s.date) },
          { key: "c", header: "Comprador", render: (s) => cust(s.customerId) },
          { key: "p", header: "Producto", render: (s) => <span className="block max-w-64 text-xs">{prodsOf(db, s)}</span> },
          { key: "ch", header: "Canal", render: (s) => s.channel },
          { key: "m", header: "Monto", align: "right", render: (s) => money(amountOf(db, s)) },
          { key: "o", header: "Orden ML", render: (s) => (s.mlOrderId ? <span className="font-mono text-xs">{s.mlOrderId}</span> : "—") },
          { key: "e", header: "Estado", render: (s) => (stateOf(s) === "unknown" ? <Badge fixed>Sin confirmar</Badge> : <Badge fixed tone="warning">Reclamo abierto</Badge>) },
        ]}
      />
      </section>
    </div>
  );
}

function RefundTab({ db, range, reasons }: { db: Db; range: { from: string; to: string; label: string }; reasons: Map<string, string> }) {
  const fell = db.sales.filter((s) => s.status === "cancelada" || s.payStatus === "reembolsada");
  const pending = fell.filter((s) => !!s.refundedAt && !s.refundDoneAt).sort((a, b) => (b.refundedAt ?? "").localeCompare(a.refundedAt ?? ""));
  // El período se mide por el día en que se cayó la venta (si no se anotó, por el de la compra).
  const dayOf = (s: Sale) => (s.refundedAt ?? s.date).slice(0, 10);
  const inRange = (s: Sale) => dayOf(s) >= range.from && dayOf(s) <= range.to;
  const rest = fell.filter((s) => !pending.includes(s) && inRange(s)).sort((a, b) => dayOf(b).localeCompare(dayOf(a))).slice(0, 200);
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const cols = (done: boolean) => [
    { key: "n", header: "N.º", render: (s: Sale) => `V-${s.number}` },
    { key: "d", header: done ? "Fecha de compra" : "Se cayó el", render: (s: Sale) => fdate(done ? s.date : (s.refundedAt ?? s.date)) },
    { key: "c", header: "Comprador", render: (s: Sale) => cust(s.customerId) },
    { key: "p", header: "Producto", render: (s: Sale) => <span className="block max-w-64 text-xs">{prodsOf(db, s)}</span> },
    { key: "ch", header: "Canal", render: (s: Sale) => s.channel },
    { key: "m", header: "A reembolsar", align: "right" as const, render: (s: Sale) => <strong>{money(amountOf(db, s))}</strong> },
    {
      key: "mo", header: "Motivo", render: (s: Sale) => (
        <form action={setCancelReason.bind(null, s.id)}>
          <select name="reason" defaultValue={reasons.get(s.id) ?? ""} aria-label="Motivo de la caída" className="h-8 max-w-52 rounded-md border border-line bg-surface px-2 text-xs">
            <option value="">Sin clasificar</option>
            {CANCEL_REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <AutoSubmit />
        </form>
      ),
    },
    {
      key: "a", header: "", render: (s: Sale) => (
        <form action={setRefundDone.bind(null, s.id, !s.refundDoneAt && !done ? true : false)}>
          {!done ? (
            <button type="submit" className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-xs font-medium hover:bg-bg">Marcar reembolsada</button>
          ) : s.refundDoneAt ? (
            <button type="submit" title={`Reembolsada el ${fdate(s.refundDoneAt)}`} className="inline-flex h-8 items-center rounded-md border border-line bg-bg px-3 text-xs text-muted hover:text-ink">Deshacer</button>
          ) : null}
        </form>
      ),
    },
  ];
  const sum = (l: Sale[]) => l.reduce((t, x) => t + amountOf(db, x), 0);
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3">
        <KpiCard label="Cantidad de reembolsos" value={String(fell.filter(inRange).length)} hint={`${range.label} · ${pending.length} por reembolsar ahora`} />
        <KpiCard label="Monto total reembolsado" value={money(sum(fell.filter((x) => inRange(x) && !pending.includes(x))))} hint={pending.length ? `${money(sum(pending))} todavía por reembolsar` : "Nada pendiente"} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Para reembolsar ({pending.length})</h2>
        <Guide title="¿Cómo funcionan los reembolsos?">Ventas que se cayeron y hay que devolverle la plata al comprador. Cuando lo hacés, tocá <strong>Marcar reembolsada</strong> y salen de esta lista.</Guide>
        <DataTable rows={pending} rowKey={(s) => s.id} emptyTitle="Nada para reembolsar" emptyDescription="Cuando se caiga una venta aparece acá." columns={cols(false)} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Ventas caídas · {range.label} ({rest.length})</h2>
        {rest.length > 0 && <p className="text-xs text-muted">Motivos: {[...rest.reduce((m, x) => m.set(reasons.get(x.id) ?? "", (m.get(reasons.get(x.id) ?? "") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${reasonLabel(c)} ${n}`).join(" · ")}</p>}
        <DataTable rows={rest} rowKey={(s) => s.id} emptyTitle="Sin ventas caídas anteriores" columns={cols(true)} />
      </section>
    </div>
  );
}

export default async function VentasPage({ searchParams }: PageProps<"/ventas">) {
  const sp = (await searchParams) as SearchParams;
  const db = await getDb();
  const tab = TABS.find((t) => t[0] === param(sp, "tab"))?.[0] ?? "compradores";
  const claims = await claimStates();
  const history = await claimHistory();
  const reasons = isSupabase() && param(sp, "tab") === "reembolsar" ? await cancelReasons(await activeProjectId()).catch(() => new Map<string, string>()) : new Map<string, string>();
  const range = rangeOf(sp);

  // Contadores del tablero.
  const live = db.sales.filter((s) => s.status !== "cancelada" && ["Mercado Libre", "Tienda Nube", "WhatsApp", "Instagram", "Campaña Meta", "Meta"].includes(s.channel));
  const cust = (id: string) => db.customers.find((c) => c.id === id);
  const porContactar = live.filter((s) => !isWelcomed(s));
  const esperando = live.filter((s) => isWelcomed(s) && !s.waitingHidden && !!(s.welcomedAt ?? s.welcomeSentAt) && !inAgenda(cust(s.customerId) ?? {}));
  const claimsN = db.sales.filter((s) => s.status !== "cancelada" && s.payStatus !== "reembolsada" && (s.payStatus === "reclamo" || (s.mlOrderId && claims.get(s.mlOrderId) === "opened"))).length;
  const refundN = db.sales.filter((s) => (s.status === "cancelada" || s.payStatus === "reembolsada") && !!s.refundedAt && !s.refundDoneAt).length;
  // Históricos del período elegido (se miden por la fecha de la última novedad del reclamo y por el día en que se cayó la venta).
  const claimsInRange = history.filter((h) => h.updated >= range.from && h.updated <= range.to);
  const closedInRange = claimsInRange.filter((h) => h.status === "closed").length;
  const refundsInRange = db.sales.filter((s) => (s.status === "cancelada" || s.payStatus === "reembolsada") && (s.refundedAt ?? s.date).slice(0, 10) >= range.from && (s.refundedAt ?? s.date).slice(0, 10) <= range.to);
  const counts: Record<string, number> = { compradores: porContactar.length, historial: 0, reclamos: claimsN, reembolsar: refundN };

  const channel: "Mercado Libre" | "Tienda Nube" | "WhatsApp" | "Meta" = ({ tn: "Tienda Nube", wa: "WhatsApp", meta: "Meta" } as Record<string, "Tienda Nube" | "WhatsApp" | "Meta" | undefined>)[param(sp, "c")] ?? "Mercado Libre";
  let messages: { id: string; orderId: string; text: string; date: string; fromBuyer: boolean }[] = [];
  if (tab === "compradores" && channel === "Mercado Libre" && isSupabase()) {
    const ids = live.filter((s) => s.channel === "Mercado Libre" && s.mlOrderId && (!isWelcomed(s) || s.welcomedAt || s.welcomeSentAt)).map((s) => s.mlOrderId!);
    messages = await mlMessagesFor(await activeProjectId(), [...new Set(ids)]).catch(() => []);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Ventas" subtitle="Tablero de ventas: compradores nuevos, historial, reclamos y reembolsos" actions={
        <ManualSale
          channels={db.settings.channels} payMethods={db.settings.payMethods}
          products={db.products.filter((p) => p.kind !== "consumible" && p.active !== false && !p.name.startsWith("Compras varias")).sort((x, y) => x.name.localeCompare(y.name)).map((p) => ({ id: p.id, name: p.name, price: p.price }))}
          customers={db.customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "", doc: c.doc ?? "", address: c.address ?? "", city: c.city ?? "" }))}
        />
      } />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Por contactar" value={String(porContactar.length)} hint="Compradores nuevos sin bienvenida" />
        <KpiCard label="Esperando datos" value={String(esperando.length)} hint="Ya contactados, sin teléfono" />
        <KpiCard label="Reclamos" value={String(claimsInRange.length)} hint={`${range.label}\n${claimsN} abiertos ahora · ${closedInRange} cerrados`} />
        <KpiCard label="Reembolsos" value={String(refundsInRange.length)} hint={`${range.label}\n${refundN} por reembolsar ahora`} />
      </section>
      <nav className="grid max-w-3xl grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label="Secciones de ventas">
        {TABS.map(([k, label]) => (
          <Link key={k} href={hrefWith({ tab: k, ip: param(sp, "ip"), from: param(sp, "from"), to: param(sp, "to") }, {})} className={`inline-flex h-10 w-full items-center justify-center rounded-md px-3 text-sm font-medium ${k === "compradores" ? (k === tab ? "bg-[#16a34a] text-white" : "border border-[#16a34a] bg-[#16a34a]/10 text-[#15803d] hover:bg-[#16a34a]/20") : k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>
            {label}{counts[k] ? <span className="ml-1.5 rounded-full bg-black/10 px-1.5 text-xs">{counts[k]}</span> : null}
          </Link>
        ))}
      </nav>

      {(tab === "reclamos" || tab === "reembolsar") && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Período de reclamos y reembolsos</p>
          <PeriodTabs sp={sp} />
        </div>
      )}

      {tab === "compradores" && (
        <div className="space-y-4">
          <nav className="grid max-w-3xl grid-cols-2 gap-1.5 sm:grid-cols-4" aria-label="Plataforma">
            {([["", "Mercado Libre"], ["tn", "Tienda Nube"], ["wa", "WhatsApp"], ["meta", "Meta"]] as const).map(([k, label]) => (
              <Link key={k} href={hrefWith({ tab: "compradores", c: k, v: param(sp, "v") }, {})} className={`inline-flex h-10 w-full items-center justify-center rounded-full border px-3 text-sm ${label === channel ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
            ))}
          </nav>
          <NewBuyersTab db={db} channel={channel} sp={sp} messages={messages} />
        </div>
      )}
      {tab === "historial" && <HistorialTab sp={sp} db={db} />}
      {tab === "reclamos" && <ClaimsTab db={db} claims={claims} history={history} range={range} />}
      {tab === "reembolsar" && <RefundTab db={db} range={range} reasons={reasons} />}
    </div>
  );
}
