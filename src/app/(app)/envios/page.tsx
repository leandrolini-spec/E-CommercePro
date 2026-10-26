import Link from "next/link";
import { ContactButtons, WhatsAppNotify } from "@/components/shared/ContactButtons";
import { seguimientoUrl } from "@/modules/seguimiento";
import { deliveryRules, diasLabel, entregaLabel, estimateDelivery, horarioLabel } from "@/modules/delivery";
import { DriverCard } from "./DriverCard";
import { GrowerCard } from "./GrowerCard";
import { findGrower, growerMessage, isProductosOrder, type GrowerOrder } from "@/modules/grower";
import { waLink } from "@/lib/contact";
import { quickFor } from "@/modules/quick-replies";
import { CARRIERS, carrierColor, carrierName, carrierOf, isExternal, isOwn } from "@/modules/carriers";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { InfoCardButton } from "@/components/shared/InfoCardButton";
import { IconArrowLeft, IconPencil } from "@/components/shared/icons";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, Filters, matches, PageHeader, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, int, isoDaysAgo, today } from "@/lib/format";
import { importMlShipments, replyToBuyer } from "@/integrations/mercadolibre/actions";
import { mlMessagesFor } from "@/integrations/mercadolibre/data";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import { createShipment, deleteShipment, moveShipment, updateShipment } from "@/modules/actions";
import { getDb } from "@/modules/data";
import { labelCustomerDoc } from "@/modules/labels";
import { DEFAULT_MESSAGES, renderMessage, stagesOf } from "@/modules/shipments";
import type { Shipment } from "@/modules/types";

/** Localidad con la provincia completa: CABA se escribe entera. */
const fullPlace = (city?: string) => (city ?? "").replace(/\s+,/g, ",").replace(/\b(CABA|Capital Federal)\b/gi, "Ciudad Autónoma de Buenos Aires").trim();
const CHANNEL_COLORS: Record<string, string> = { "Mercado Libre": "#f59e0b", "Tienda Nube": "#2563eb", Instagram: "#db2777", WhatsApp: "#16a34a", "Campaña Meta": "#7c3aed" };
const FINISHED = ["entregado", "volvio"];

/** Lo que lleva el pedido: un renglón por producto, con la cantidad bien marcada ("2 × Producto · 1 × Otro"). */
function OrderItems({ items, large = false, max }: { items: string; large?: boolean; max?: number }) {
  const all = items.split(" · ").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\d+)\s*[×x]\s*(.+)$/i.exec(l);
    return { qty: m ? m[1] : "", name: m ? m[2] : l };
  });
  if (!all.length) return null;
  // Con tope: se muestran max - 1 productos y un renglón "+N más", así la tarjeta no crece.
  const cut = max !== undefined && all.length > max;
  const lines = cut ? all.slice(0, max - 1) : all;
  return (
    <ul className={large ? "space-y-2" : "mt-1.5 space-y-1"}>
      {lines.map((l, i) => (
        <li key={i} className="flex items-start gap-2">
          {l.qty && <span className={`inline-flex shrink-0 items-center justify-center rounded-md bg-ink font-semibold tabular-nums text-white ${large ? "min-w-9 px-2 py-1 text-base" : "min-w-7 px-1.5 py-0.5 text-xs"}`}>{l.qty}×</span>}
          <span title={l.name} className={`${large ? "pt-0.5 text-base" : "truncate pt-0.5 text-sm"} font-medium leading-snug`}>{l.name}</span>
        </li>
      ))}
      {cut && <li className="text-xs text-muted">+ {all.length - lines.length} producto{all.length - lines.length === 1 ? "" : "s"} más (ver detalle)</li>}
    </ul>
  );
}

export default async function EnviosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = await getDb();
  const stages = stagesOf(db.settings);
  const view = param(sp, "view") === "lista" ? "lista" : "tablero";
  const q = param(sp, "q"), channel = param(sp, "channel"), from = param(sp, "from"), to = param(sp, "to"), all = param(sp, "all") === "1";
  const customerOf = (x: Shipment) => x.customer || db.customers.find((c) => c.id === db.sales.find((s) => s.id === x.saleId)?.customerId)?.name || "";
  const since = isoDaysAgo(30);

  // Mensajes de Mercado Libre de cada orden, para leerlos desde la tarjeta sin entrar al formulario.
  const msgsByOrder = new Map<string, { id: string; text: string; date: string; fromBuyer: boolean }[]>();
  if (isSupabase()) {
    // Solo las conversaciones de las órdenes que están en Envíos (antes se traían todas).
    const all = await mlMessagesFor(await activeProjectId(), [...new Set((db.shipments ?? []).map((x) => x.orderRef).filter(Boolean))]).catch(() => []);
    for (const m of all) if (m.orderId) msgsByOrder.set(m.orderId, [...(msgsByOrder.get(m.orderId) ?? []), m]);
  }
  const everything = db.shipments ?? [];
  const filtered = everything
    .filter((x) => matches(q, customerOf(x), x.items, x.address, x.city, x.orderRef, x.phone, x.tracking) && (!channel || x.channel === channel) && (!from || x.createdAt >= from) && (!to || x.createdAt <= to))
    // Por defecto se muestran los últimos 30 días y todo lo que todavía está en curso; "Ver todo el historial" muestra el resto.
    .filter((x) => all || from || to || x.createdAt >= since || !FINISHED.includes(x.stage))
    .sort((a, b) => (b.dispatchedAt ?? b.createdAt).localeCompare(a.dispatchedAt ?? a.createdAt) || b.id.localeCompare(a.id));
  const hidden = everything.length - everything.filter((x) => all || x.createdAt >= since || !FINISHED.includes(x.stage)).length;
  const known = new Set(stages.map((s) => s.id));
  const columns = [...stages, ...(filtered.some((x) => !known.has(x.stage)) ? [{ id: "__sin", name: "Sin etapa", color: "#94a3b8" }] : [])];
  const stageOf = (x: Shipment) => (known.has(x.stage) ? x.stage : "__sin");
  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? "Sin etapa";
  const stageCol = (id: string) => stages.find((s) => s.id === id)?.color ?? "#94a3b8";
  const days = (a?: string) => (a ? Math.max(0, Math.round((new Date(today()).getTime() - new Date(a).getTime()) / 86400000)) : 0);

  const fields = (x?: Shipment) => [
    { name: "customer", label: "Cliente", required: true, defaultValue: x ? customerOf(x) : "" },
    { name: "items", label: "Productos (qué se compró)", type: "textarea" as const, defaultValue: x?.items },
    { name: "address", label: "A dónde va (domicilio y referencias)", defaultValue: x?.address },
    { name: "city", label: "Ciudad y provincia", defaultValue: x?.city },
    { name: "zip", label: "Código postal", defaultValue: x?.zip },
    { name: "phone", label: "Teléfono", defaultValue: x?.phone },
    // El DNI es del destinatario: se guarda en su ficha de cliente (de ahí lo toma la etiqueta de Vía Cargo, Andreani y Correo).
    { name: "dni", label: "DNI del destinatario", defaultValue: x ? labelCustomerDoc(db, x) : "", help: "Para las etiquetas de Vía Cargo, Andreani y Correo Argentino" },
    { name: "notes", label: "Detalle / notas del pedido", type: "textarea" as const, defaultValue: x?.notes },
    { name: "channel", label: "Canal de venta", type: "select" as const, defaultValue: x?.channel, options: db.settings.channels.map((c) => ({ value: c, label: c })) },
    { name: "orderRef", label: "N.º de orden o venta", defaultValue: x?.orderRef },
    { name: "tracking", label: "N.º de seguimiento (si hay)", defaultValue: x?.tracking },
    { name: "stage", label: "Etapa", type: "select" as const, defaultValue: x?.stage ?? stages[0].id, options: stages.map((s) => ({ value: s.id, label: s.name })) },
    { name: "carrier", label: "Cómo se envía", type: "select" as const, defaultValue: carrierOf(x?.carrier), half: true, noBlank: true, section: "Entrega", help: "El chofer solo se usa en Reparto propio", options: CARRIERS.map(([value, label]) => ({ value, label })) },
    ...(x ? [{ name: "eta", label: "Entrega estimada", type: "date" as const, defaultValue: x.eta ?? etaOf(x), half: true, help: "Se calcula sola con las reglas de entrega; acá la podés cambiar." }] : []),
    { name: "dispatchedAt", label: "Día que salió", type: "date" as const, defaultValue: x?.dispatchedAt, half: true, section: "Fechas" },
    ...(x ? [{ name: "deliveredAt", label: "Día que se entregó", type: "date" as const, defaultValue: x.deliveredAt, half: true }] : []),
  ];

  // Datos de la empresa para los mensajes: la tienda online y el Instagram se cargan en Configuración → Empresa.
  const company = db.settings.company ?? {};
  const web = company.website ? (/^https?:\/\//.test(company.website) ? company.website : `https://${company.website}`) : "";
  const handle = (company.instagram ?? "").trim();
  const insta = !handle ? "" : /^https?:\/\//.test(handle) ? handle : `https://www.instagram.com/${handle.replace(/^@/, "")}`;
  const rules = deliveryRules(company);
  const appBase = process.env.APP_BASE_URL ?? "";
  const etaOf = (x: Shipment) => x.eta ?? estimateDelivery(x.createdAt, rules);
  // Transportes con plazo según el destino (Vía Cargo, Andreani, Correo Argentino): sin fecha fija de reparto.
  const viaCargo = (x: Shipment) => isExternal(x.carrier);
  // Pedidos de productos paral productor: nombre de la persona y su encargo.
  const toGrower = (x: Shipment): GrowerOrder => ({ name: customerOf(x), items: x.items, orderRef: x.orderRef, channel: x.channel, entrega: isExternal(x.carrier) ? "" : entregaLabel(etaOf(x)), notes: x.notes });
  const growerOrders = everything.filter((x) => ["compra", "preparado", "empaquetado"].includes(x.stage) && isProductosOrder(x.items)).map(toGrower);
  // El chofer solo existe en reparto propio: con Logística o Vía Cargo no se sabe (ni se dice) quién entrega.
  const ownDelivery = (x: Shipment) => isOwn(x.carrier);
  const messageFor = (x: Shipment) => {
    const st = stages.find((s) => s.id === x.stage);
    const viaTpl = viaCargo(x) && DEFAULT_MESSAGES[`${x.stage}_viacargo`] ? DEFAULT_MESSAGES[`${x.stage}_viacargo`].replaceAll("Vía Cargo", carrierName(x.carrier)) : "";
    const tpl = st?.message || viaTpl || DEFAULT_MESSAGES[x.stage] || `Hola {nombre}! Novedades de tu pedido de nuestra tienda: ${st?.name ?? ""}.`;
    return renderMessage(tpl, {
      nombre: (customerOf(x) || "").split(" ")[0] || "", productos: x.items, direccion: [x.address, x.city].filter(Boolean).join(", "), repartidor: ownDelivery(x) ? (x.courier ?? "") : "",
      vehiculo: ownDelivery(x) && x.courier ? (x.vehicle ?? "") : "", patente: ownDelivery(x) && x.courier ? (x.plate ?? "") : "", fecha: x.dispatchedAt ? fdate(x.dispatchedAt) : "",
      tienda: web, instagram: insta, empresa: db.settings.name,
      entrega: entregaLabel(etaOf(x)), horario: horarioLabel(rules), seguimiento: x.tracking, enlace: "", dias: diasLabel(rules),
    });
  };
  const inTransit = everything.filter((x) => x.stage === "en_viaje").length;
  const pending = everything.filter((x) => x.stage === stages[0].id || x.stage === "preparado" || x.stage === "empaquetado").length;
  // Celular: se ve una etapa por vez y se recorren con las flechas de arriba (en escritorio se ven todas las columnas).
  const etapaParam = param(sp, "etapa");
  const colIds = columns.map((c) => c.id);
  const todas = etapaParam === "todas";
  const current = colIds.includes(etapaParam) ? etapaParam : columns.find((c) => filtered.some((x) => stageOf(x) === c.id))?.id ?? colIds[0];
  const curIdx = colIds.indexOf(current);
  const prevCol = curIdx > 0 ? columns[curIdx - 1] : null;
  const nextCol = curIdx < columns.length - 1 ? columns[curIdx + 1] : null;
  const curCol = columns[curIdx];
  const curCount = filtered.filter((x) => stageOf(x) === current).length;
  const href = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") u.set(k, Array.isArray(v) ? v[0] : v);
    for (const [k, v] of Object.entries(extra)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    return `?${u}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Envíos" subtitle={`${int(inTransit)} en viaje · ${int(pending)} por preparar · ${int(everything.length)} en total`}
        actions={
          <>
            <CreateDrawer buttonLabel="Nuevo envío" title="Nuevo envío" action={createShipment} fields={fields()} />
            <Link href="/etiquetas" className="inline-flex h-9 items-center gap-2 rounded-md bg-ink px-3.5 text-sm font-medium text-white hover:opacity-90"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11h8v6H6z" /></svg>Imprimir etiquetas ({int(everything.filter((x) => x.stage === "empaquetado").length)})</Link>
            <Link href="/envios/resumen" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-bg">Imprimir resumen</Link>
            <ActionButton action={importMlShipments} label="Traer envíos de ML" variant="secondary" tall />
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Por preparar" value={int(pending)} hint="Compra + preparado + empaquetado" />
        <KpiCard label="En viaje" value={int(inTransit)} hint={inTransit ? "Pedidos que están saliendo a entregar" : "Ninguno en este momento"} />
        <KpiCard label="Entregados esta semana" value={int(everything.filter((x) => x.stage === "entregado" && (x.deliveredAt ?? x.dispatchedAt ?? x.createdAt) >= isoDaysAgo(6)).length)} />
        <KpiCard label="Con reclamos" value={int(everything.filter((x) => ["no_entregado", "volvio"].includes(x.stage)).length)} hint="No se entregó o volvió a depósito" />
      </section>
      <GrowerCard db={db} orders={growerOrders} />
      <DriverCard db={db} shipments={everything.filter((x) => isOwn(x.carrier))} />
      <nav className="flex gap-1.5" aria-label="Vista">
        {([["tablero", "Tablero"], ["lista", "Lista"]] as const).map(([k, label]) => (
          <Link key={k} href={href({ view: k })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === view ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <Filters sp={sp} dates searchPlaceholder="Buscar por cliente, producto, dirección, orden o teléfono" filters={[{ name: "channel", label: "Canal", options: db.settings.channels }]} />
      {view === "tablero" && !todas && curCol && (
        <div className="flex items-stretch gap-2 md:hidden" aria-label="Etapas">
          {prevCol ? <Link href={href({ etapa: prevCol.id })} aria-label={`Etapa anterior: ${prevCol.name}`} className="flex w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-surface px-1 py-2 text-xs font-medium text-muted hover:text-ink"><span className="text-lg leading-none">←</span><span className="mt-0.5 w-full truncate text-center">{prevCol.name}</span></Link> : <span className="w-24 shrink-0" />}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border-t-4 bg-surface px-2 py-2 text-center shadow-sm" style={{ borderColor: curCol.color }}>
            <p className="text-[11px] uppercase tracking-wide text-muted">Etapa {curIdx + 1} de {columns.length}</p>
            <p className="font-semibold">{curCol.name} <span className="text-muted">({curCount})</span></p>
          </div>
          {nextCol ? <Link href={href({ etapa: nextCol.id })} aria-label={`Etapa siguiente: ${nextCol.name}`} className="flex w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-surface px-1 py-2 text-xs font-medium text-muted hover:text-ink"><span className="text-lg leading-none">→</span><span className="mt-0.5 w-full truncate text-center">{nextCol.name}</span></Link> : <span className="w-24 shrink-0" />}
        </div>
      )}
      {view === "tablero" && (
        <p className="text-center text-xs md:hidden"><Link href={href({ etapa: todas ? current : "todas" })} className="text-primary underline">{todas ? "Ver de a una etapa" : "Ver todas las etapas juntas"}</Link></p>
      )}
      {hidden > 0 && !all && <p className="text-xs text-muted">Se ocultan {hidden} envíos ya entregados de hace más de 30 días. <Link href={href({ all: "1" })} className="text-primary underline">Ver todo el historial</Link></p>}
      {all && <p className="text-xs text-muted">Mostrando todo el historial. <Link href={href({ all: "" })} className="text-primary underline">Volver a los últimos 30 días</Link></p>}

      {view === "tablero" ? (
        <div className="flex flex-col gap-3 pb-3 md:flex-row md:overflow-x-auto">
          {columns.map((col, ci) => {
            const cards = filtered.filter((x) => stageOf(x) === col.id);
            return (
              <section key={col.id} className={`w-full rounded-lg bg-bg p-2 md:block md:w-80 md:shrink-0 ${todas ? (cards.length === 0 ? "hidden" : "") : col.id !== current ? "hidden" : ""}`}>
                <h2 className="mb-2 flex items-center justify-between border-t-4 px-1 pt-2 text-sm font-semibold" style={{ borderColor: col.color }}>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} aria-hidden />{col.name}</span>
                  <span className="flex items-center gap-1.5">
                    {cards.length > 0 && <Link href={`/etiquetas?stage=${col.id}`} title={`Imprimir las etiquetas de ${col.name}`} aria-label={`Imprimir las etiquetas de ${col.name}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-muted hover:text-ink"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11h8v6H6z" /></svg></Link>}
                    <Badge>{cards.length}</Badge>
                  </span>
                </h2>
                <div className="space-y-2">
                  {cards.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">Sin envíos</p>}
                  {cards.map((x) => (
                    <article key={x.id} className="flex h-[28rem] flex-col rounded-lg border border-line bg-surface p-3 text-sm shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-semibold [overflow-wrap:anywhere]">{customerOf(x) || "Cliente sin cargar"}</p>
                        {x.channel && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: CHANNEL_COLORS[x.channel] ?? "#0891b2" }}>{x.channel}</span>}
                      </div>
                      <p className="mt-1.5"><span className="inline-flex h-7 items-center rounded-md px-3 text-xs font-bold uppercase tracking-wide text-white" style={{ background: carrierColor(x.carrier) }}>{carrierName(x.carrier)}</span></p>
                      {(() => {
                        const msgs = [...(msgsByOrder.get(x.orderRef) ?? [])].sort((m1, m2) => m1.date.localeCompare(m2.date));
                        const buyerMsgs = msgs.filter((m) => m.fromBuyer).length;
                        const stage = columns.find((c) => c.id === stageOf(x));
                        return (
                          <>
                            <div className="min-h-0 flex-1 overflow-hidden">
                              {x.items && <OrderItems items={x.items} max={2} />}
                              <p className="mt-1.5 text-xs font-medium text-ink">Compró el {fdate(x.createdAt)}</p>
                              <p className="mt-1.5 text-xs text-muted">
                                <span className="block"><span aria-hidden>📍</span> {x.address?.trim() ? <strong className="font-medium text-ink">{x.address.trim()}</strong> : <span className="italic">Sin dirección</span>}</span>
                                <span className="block pl-[1.15rem]">{fullPlace(x.city) || "Sin ciudad"} · {["entregado", "volvio", "no_entregado"].includes(x.stage) ? `Compra ${fdate(x.createdAt)}` : viaCargo(x) ? carrierName(x.carrier) : `Entrega ${entregaLabel(etaOf(x))}`}
                                {x.stage === "en_viaje" && x.dispatchedAt && <> · <strong className="text-ink">salió hace {days(x.dispatchedAt)} d</strong></>}</span>
                              </p>
                              {!["entregado", "volvio", "no_entregado"].includes(x.stage) && (!x.phone?.trim() || !x.address?.trim()) && (
                                <p className="mt-1.5"><span className="inline-flex rounded-full bg-[#d97706]/15 px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">Faltan datos: {[!x.phone?.trim() && "teléfono", !x.address?.trim() && "domicilio"].filter(Boolean).join(", ")}</span></p>
                              )}
                              {((x.courier && ownDelivery(x)) || buyerMsgs > 0) && (
                                <p className="mt-1.5 flex items-center gap-2 truncate text-xs">
                                  {x.courier && ownDelivery(x) && <span className="min-w-0 truncate rounded-md bg-bg px-2 py-0.5">🚚 <strong>{x.courier}</strong>{x.plate && ` · ${x.plate.toUpperCase()}`}</span>}
                                  {buyerMsgs > 0 && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={`${buyerMsgs} mensaje${buyerMsgs === 1 ? "" : "s"} del comprador`}>💬 {buyerMsgs}</span>}
                                </p>
                              )}
                            </div>

                            <div className="mt-2.5">
                              <WhatsAppNotify phone={x.phone} text={messageFor(x)} label={`Avisar: ${stageName(x.stage)}`} block />
                            </div>
                            {/* Mensajería de la plataforma: Mercado Libre se contesta desde acá; en las demás queda el botón gris, del mismo tamaño. */}
                            <div className="mt-1.5">
                              {(() => {
                                const buyer = (db.sales.find((sa) => sa.id === x.saleId)?.customerId ?? "").replace(/^mlb_/, "");
                                const icon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3h0A1.5 1.5 0 0 1 3 11.5v-7Z" /></svg>;
                                if (x.channel === "Mercado Libre" && x.orderRef && buyer && !(db.sales.find((sa) => sa.id === x.saleId)?.customerId ?? "").startsWith("tnc_")) {
                                  const conv = [...(msgsByOrder.get(x.orderRef) ?? [])].sort((m1, m2) => m1.date.localeCompare(m2.date));
                                  return (
                                    <CreateDrawer buttonLabel="Mensaje por Mercado Libre" icon={icon} title={`Mensaje a ${customerOf(x) || "comprador"} · Mercado Libre`} action={replyToBuyer.bind(null, x.orderRef, buyer)}
                                      className="h-9 w-full justify-center gap-2 border-[#e6cf00]! bg-[#ffe600]! px-3 py-0 text-sm font-medium text-[#2d3277]! hover:bg-[#f5d800]!"
                                      fields={[
                                        ...(conv.length ? [{ name: "conversacion", label: "Conversación hasta ahora", type: "textarea" as const, readOnly: true, rows: 9, defaultValue: conv.map((m) => `${m.fromBuyer ? (customerOf(x) || "Comprador") : "Vos"} · ${new Date(m.date).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}\n${m.text || "(vacío o adjunto)"}`).join("\n\n") }] : []),
                                        { name: "text", label: "Tu mensaje (máximo 350 por mensaje; para mandar varios, separalos con una línea ---)", type: "textarea" as const, required: true, maxLength: 800, placeholder: "Escribí tu mensaje al comprador…", quick: quickFor(db.settings.company, db.settings.name, { nombre: customerOf(x), productos: x.items }) },
                                      ]} />
                                  );
                                }
                                return <span title={x.channel === "Tienda Nube" ? "La mensajería de Tienda Nube todavía no está disponible" : "Este envío no tiene mensajería de Mercado Libre"} className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-line bg-bg px-3 text-sm font-medium text-muted/70">{icon}Mensaje</span>;
                              })()}
                            </div>
                            <div className="mt-1.5">
                              {(() => {
                                const gr = findGrower(db);
                                const plant = isProductosOrder(x.items);
                                const link = plant && gr?.phone ? waLink(gr.phone, growerMessage([toGrower(x)], gr.name)) : null;
                                return link
                                  ? <a href={link} target="_blank" rel="noreferrer" title="Se abre WhatsApp con el pedido armado paral productor" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#0f766e]/40 bg-[#0f766e] px-3 text-sm font-medium text-white hover:bg-[#115e59]"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M4 16c0-7 4-11 12-12 0 8-4 12-11 12M4 16c2-3 4-5 7-7" /></svg>Pedido al productor</a>
                                  : <span title={!plant ? "Este pedido no es de productos" : "Falta el WhatsApp del productor: cargalo en Proveedores (proveedor Productor)"} className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-line bg-bg px-3 text-sm font-medium text-muted/70"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M4 16c0-7 4-11 12-12 0 8-4 12-11 12M4 16c2-3 4-5 7-7" /></svg>Pedido al productor</span>;
                              })()}
                            </div>
                            <div className="mt-2 flex items-stretch gap-1.5 border-t border-line pt-2 flex-wrap">
                              <div className="order-3 flex-1 basis-[calc(33.3%-0.25rem)] [&>*]:w-full [&_button]:w-full">
                              <InfoCardButton title={customerOf(x) || "Envío"} label="Ver el detalle del pedido" large>
                                <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {stage && <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: stage.color }}>{stage.name}</span>}
                                    {x.channel && <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: CHANNEL_COLORS[x.channel] ?? "#0891b2" }}>{x.channel}</span>}
                                    {x.orderRef && <span className="font-mono text-xs text-muted">{x.orderRef}</span>}
                                  </div>
                                  <section className="rounded-lg border-2 border-ink/80 bg-bg p-3.5">
                                    <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                                      <span>Qué lleva el pedido</span>
                                      {x.items && <span>{x.items.split(" · ").reduce((n, l) => n + (Number(/^(\d+)/.exec(l.trim())?.[1]) || 0), 0)} unidades</span>}
                                    </p>
                                    {x.items ? <OrderItems items={x.items} large /> : <p className="text-sm text-muted">Sin productos cargados. Cargalos con el lápiz.</p>}
                                    <p className="mt-2.5 text-[11px] text-muted">Si el pedido cambió, corregí la lista con el lápiz (Editar).</p>
                                    <Link href={`/etiquetas/imprimir?ids=${x.id}`} className="mt-3 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-bg"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11h8v6H6z" /></svg>Imprimir la etiqueta de este envío</Link>
                                  </section>
                                  <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                                    {([
                                      ["Envío", carrierName(x.carrier)], ["Entrega estimada", viaCargo(x) ? "El plazo depende del destino" : `${entregaLabel(etaOf(x))}, ${horarioLabel(rules)}`], ["Teléfono", x.phone], ["Domicilio", x.address], ["Ciudad", x.city], ["Código postal", x.zip],
                                      ["Seguimiento", x.tracking], ["Repartidor", ownDelivery(x) ? [x.courier, x.courierPhone].filter(Boolean).join(" · ") : ""], ["Vehículo", ownDelivery(x) ? [x.vehicle, x.plate?.toUpperCase()].filter(Boolean).join(" · ") : ""],
                                    ] as [string, string | undefined][]).map(([k, v]) => (
                                      <div key={k} className="contents"><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="break-words">{v || "—"}</dd></div>
                                    ))}
                                  </dl>
                                  <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-bg p-2.5 text-center">
                                    <div><p className="text-[11px] uppercase tracking-wide text-muted">Compra</p><p className="font-semibold">{fdate(x.createdAt)}</p></div>
                                    <div><p className="text-[11px] uppercase tracking-wide text-muted">Salió</p><p className="font-semibold">{x.dispatchedAt ? fdate(x.dispatchedAt) : "—"}</p></div>
                                    <div><p className="text-[11px] uppercase tracking-wide text-muted">Entregado</p><p className="font-semibold">{x.deliveredAt ? fdate(x.deliveredAt) : "—"}</p></div>
                                  </div>
                                  <a href={seguimientoUrl(appBase, x.id)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium hover:bg-bg">Ver la página de seguimiento que recibe el cliente ↗</a>
                                  {x.notes && <p className="whitespace-pre-wrap rounded-md border border-line p-2.5 text-xs text-muted">{x.notes}</p>}
                                  {msgs.length > 0 && (
                                    <div>
                                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Conversación con el comprador</p>
                                      <ul className="space-y-1.5">
                                        {msgs.map((m) => (
                                          <li key={m.id} className={`rounded-md px-3 py-2 text-sm leading-snug ${m.fromBuyer ? "bg-surface ring-1 ring-line" : "bg-primary/10"}`}>
                                            <p className="mb-0.5 text-[11px] text-muted"><strong>{m.fromBuyer ? customerOf(x) || "Comprador" : "Negocio"}</strong> · {fdate(m.date)}</p>
                                            <p className="whitespace-pre-wrap">{m.text.trim() || "(mensaje vacío o adjunto)"}</p>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  <ContactButtons name={customerOf(x) || "cliente"} phone={x.phone} />
                                </div>
                              </InfoCardButton>
                              </div>
                              <div className={ci > 0 && columns[ci - 1].id !== "__sin" ? "order-1 [&>form>button]:h-9 [&>form>button]:w-9" : "hidden"}>{ci > 0 && columns[ci - 1].id !== "__sin" && (<ActionButton action={moveShipment.bind(null, x.id, columns[ci - 1].id)} label={`Volver a ${columns[ci - 1].name}`} iconOnly icon={<IconArrowLeft />} />)}</div>
                              <div className={`order-2 flex min-w-0 flex-1 [&>*]:min-w-0 ${ci > 0 && columns[ci - 1].id !== "__sin" ? "basis-[calc(100%-3.25rem)]" : "basis-full"} [&_button]:h-auto [&_button]:min-h-9 [&_button]:w-full [&_button]:whitespace-normal [&_button]:px-2 [&_button]:py-1.5 [&_button]:text-center [&_button]:text-xs [&_button]:leading-tight`}>
                              {ci < columns.length - 1 && columns[ci + 1].id !== "__sin" ? (
                                <ActionButton action={moveShipment.bind(null, x.id, columns[ci + 1].id)} label={`${columns[ci + 1].name} →`} variant="primary" tall block />
                              ) : <div className="flex-1" />}
                              </div>
                              <div className="order-4 flex-1 basis-[calc(33.3%-0.25rem)] [&>*]:w-full [&_button]:w-full"><CreateDrawer buttonLabel="Editar" iconOnly icon={<IconPencil />} variant="secondary" title={`Envío de ${customerOf(x) || "cliente"}`} action={updateShipment.bind(null, x.id)} fields={fields(x)} /></div>
                              <div className="order-5 flex-1 basis-[calc(33.3%-0.25rem)] [&>*]:w-full [&_button]:w-full"><ConfirmActionButton action={deleteShipment.bind(null, x.id)} label="Eliminar envío" message={`¿Eliminar el envío de ${customerOf(x) || "este cliente"}? Esta acción no se puede deshacer.`} icon tall /></div>
                            </div>
                          </>
                        );
                      })()}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable
          rows={filtered} rowKey={(x) => x.id} emptyTitle="Sin envíos" emptyDescription="Cada compra nueva entra sola en la primera etapa. También podés cargar uno con “Nuevo envío”."
          columns={[
            { key: "d", header: "Compra", render: (x) => fdate(x.createdAt) },
            { key: "s", header: "Salió", render: (x) => (x.dispatchedAt ? fdate(x.dispatchedAt) : "—") },
            { key: "c", header: "Cliente", render: (x) => <div><p className="font-medium">{customerOf(x) || "—"}</p><p className="font-mono text-xs text-muted">{x.orderRef}</p></div> },
            { key: "p", header: "Productos", render: (x) => <span className="text-xs">{x.items || "—"}</span> },
            { key: "a", header: "Destino", render: (x) => <span className="text-xs">{[x.address, x.city].filter(Boolean).join(" · ") || "—"}</span> },
            { key: "ch", header: "Canal", render: (x) => x.channel || "—" },
            { key: "rp", header: "Repartidor y vehículo", render: (x) => <div className="text-xs"><p className="mb-0.5"><span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: carrierColor(x.carrier) }}>{carrierName(x.carrier)}</span></p>{ownDelivery(x) && <p className="font-medium">{x.courier || "—"}</p>}<p className="text-muted">{ownDelivery(x) ? [x.vehicle, x.plate?.toUpperCase()].filter(Boolean).join(" · ") : ""}</p></div> },
            { key: "e", header: "Etapa", render: (x) => <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: stageCol(x.stage) }}>{stageName(x.stage)}</span> },
            { key: "ac", header: "", render: (x) => <CreateDrawer buttonLabel="Editar" variant="secondary" title={`Envío de ${customerOf(x) || "cliente"}`} action={updateShipment.bind(null, x.id)} fields={fields(x)} /> },
          ]}
        />
      )}
    </div>
  );
}
