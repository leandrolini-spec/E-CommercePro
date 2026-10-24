import Link from "next/link";
import { ContactButtons } from "@/components/shared/ContactButtons";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { bannerOf, themeProps } from "@/components/shared/platform-theme";
import { ActionButton, Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Guide } from "@/components/ui/Guide";
import { Alert, Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, int, money, pct } from "@/lib/format";
import { setListing } from "@/modules/actions";
import { saleTotals, stockOf } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { tnConfigured, tnMissing } from "@/integrations/tiendanube/config";
import { TN_FEE_PCT } from "@/integrations/tiendanube/sync";
import { getTnAccount } from "@/integrations/tiendanube/oauth";
import { reloadTnAll, syncTnNow, updateTnProduct } from "@/integrations/tiendanube/actions";
import { lastTnSync, tnLiveByProduct } from "@/integrations/tiendanube/data";
import { activeProjectId } from "@/modules/repo/supabase";
import { stagesOf } from "@/modules/shipments";

const CHANNEL = "Tienda Nube";
const STORE_ADMIN = "https://tu-tienda.mitiendanube.com/admin";
const STORE_PUBLIC = "https://tu-tienda.com";
const TABS = [["resumen", "Resumen"], ["ventas", "Ventas"], ["publicaciones", "Publicaciones"], ["clientes", "Clientes"], ["envios", "Envíos"]] as const;
const LISTING = { active: { label: "Publicado", tone: "success" }, out_of_stock: { label: "Publicado · sin stock", tone: "warning" }, paused: { label: "Pausado", tone: "warning" } } as const;

/**
 * Tienda Nube: todo lo del canal en un solo lugar. Hoy se alimenta con lo que se carga en el CRM (ventas por “Cargar ventas”, publicaciones por “Canales”);
 * cuando se conecte la tienda, los pedidos, productos y stock van a entrar solos.
 */
export default async function TiendaNubePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  // La base y los datos de la tienda se piden al mismo tiempo (antes esperaba uno por uno).
  const tnP = (async () => {
    const projectId = await activeProjectId().catch(() => "");
    const tn = tnConfigured() && projectId ? await getTnAccount(projectId).catch(() => null) : null;
    const [live, last] = tn ? await Promise.all([tnLiveByProduct(projectId).catch(() => new Map()), lastTnSync(projectId).catch(() => null)]) : [new Map(), null];
    return { projectId, tn, live, last };
  })();
  const [db, { tn, live, last }] = await Promise.all([getDb(), tnP]);
  const tab = TABS.find((t) => t[0] === param(sp, "tab"))?.[0] ?? "resumen";
  const q = param(sp, "q"), from = param(sp, "from"), to = param(sp, "to"), stateF = param(sp, "estado");

  const sales = db.sales.filter((s) => s.channel === CHANNEL).sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  const valid = sales.filter((s) => s.status !== "cancelada");
  const totals = valid.map((s) => saleTotals(db, s));
  const gross = totals.reduce((a, t) => a + t.revenue, 0), net = totals.reduce((a, t) => a + t.net, 0);
  const units = totals.reduce((a, t) => a + t.units, 0);
  const customerOf = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const productName = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";

  const listed = db.products.filter((p) => p.listings?.some((l) => l.channel === CHANNEL));
  const forSale = db.products.filter((p) => (p.kind ?? "venta") === "venta" && p.active !== false);
  const activeCount = listed.filter((p) => p.listings!.find((l) => l.channel === CHANNEL)!.status === "active").length;
  const lastBuy = (id: string) => db.sales.filter((s) => s.customerId === id && s.status !== "cancelada").map((s) => s.date).sort().at(-1) ?? "";
  const clients = db.customers.filter((c) => c.origin === CHANNEL).sort((a, b) => lastBuy(b.id).localeCompare(lastBuy(a.id)));
  const stages = stagesOf(db.settings);
  const shipments = (db.shipments ?? []).filter((x) => x.channel === CHANNEL).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const ranking = (() => {
    const m = new Map<string, number>();
    for (const s of valid) for (const i of s.items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.qty);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6);
  })();
  const maxUnits = Math.max(1, ...ranking.map((r) => r[1]));

  return (
    <div {...themeProps("tn", "space-y-4")}>
      <PageHeader
        title="Tienda Nube" banner={bannerOf("tn")} logo={{ src: "/brand/tiendanube.png", height: 26 }} subtitle="Ventas, publicaciones, clientes y envíos del canal"
        actions={
          <>
            <a href={STORE_ADMIN} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-medium hover:bg-bg">Abrir administrador ↗</a>
            <a href={STORE_PUBLIC} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-medium hover:bg-bg">Ver la tienda ↗</a>
          </>
        }
      />

      {param(sp, "error") && <Alert tone="danger" title="No se pudo conectar">{param(sp, "error")}</Alert>}
      {param(sp, "conectado") && <Alert tone="success" title="Tienda Nube quedó conectada." />}
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:text-center">
          <div>
            <p className="flex flex-wrap items-center gap-2 font-semibold max-md:justify-center">Conexión {tn ? <Badge tone="success">Conectada</Badge> : <Badge tone="warning">Sin conectar</Badge>}</p>
            <p className="mt-1 text-sm text-muted">
              {tn
                ? `Tienda: ${tn.storeName ?? tn.storeId} · conectada el ${fdate(tn.connectedAt)}. ${last ? `Última sincronización: ${new Date(last.finished_at ?? last.started_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} (${last.status}).` : "Todavía no se sincronizó: tocá “Sincronizar ahora”."} Los pedidos y productos nuevos entran solos.`
                : tnConfigured()
                  ? "Tocá el botón, aceptá los permisos en Tienda Nube y volvés acá. Después los pedidos, productos, stock y clientes van a entrar solos, como pasa con Mercado Libre."
                  : `Falta cargar en Vercel: ${tnMissing().join(", ")}.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-col">
            {tn && <div className="w-full sm:w-56"><ActionButton action={syncTnNow} label="Sincronizar ahora" variant="secondary" tall block /></div>}
            {tn && <div className="w-full sm:w-56"><ActionButton action={reloadTnAll} label="Recargar todo el historial" variant="secondary" tall block /></div>}
            {tnConfigured() && (
              <a href="/api/tiendanube/connect" className="inline-flex h-9 w-full items-center sm:w-56 justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90">{tn ? "Volver a autorizar" : "Conectar Tienda Nube"}</a>
            )}
          </div>
        </div>
        <Guide className="mt-3" title="¿Qué se va a traer al conectar?">
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>✔ Pedidos y su estado de pago y envío</li><li>✔ Datos del cliente (nombre, contacto, domicilio)</li>
            <li>✔ Productos, precios y stock</li><li>✔ Avisos en tiempo real de cada pedido nuevo</li>
          </ul>
        </Guide>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Secciones">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "resumen" && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard aligned large label="Ventas" value={int(valid.length)} hint={`${int(units)} unidades vendidas`} />
            <KpiCard aligned large label="Facturación bruta" value={money(gross)} hint="Todo el historial del canal" />
            <KpiCard aligned large label="Neto cobrado" value={money(net)} hint={gross ? `Cargos e impuestos: ${money(gross - net)} (${pct(((gross - net) / gross) * 100)})` : "Después de cargos"} />
            <KpiCard aligned large label="Ticket promedio" value={money(valid.length ? gross / valid.length : 0)} />
            <KpiCard aligned large label="Publicados" value={`${activeCount} de ${forSale.length}`} hint="Productos activos en Tienda Nube" />
            <KpiCard aligned large label="Clientes" value={int(clients.length)} hint="Que compraron por Tienda Nube" />
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Productos más vendidos en Tienda Nube</h2>
              {ranking.length === 0 ? <p className="text-sm text-muted">Todavía no hay ventas de este canal.</p> : (
                <ul className="space-y-2.5 text-sm">
                  {ranking.map(([id, n]) => (
                    <li key={id}>
                      <div className="mb-0.5 flex justify-between gap-2"><span className="md:truncate">{productName(id)}</span><span className="font-medium">{n} u.</span></div>
                      <div className="h-2 rounded bg-line"><div className="h-2 rounded bg-primary" style={{ width: `${(n / maxUnits) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Últimas ventas</h2>
              {sales.length === 0 ? <p className="text-sm text-muted">Cargá la primera desde Stock → Cargar ventas, eligiendo el canal Tienda Nube.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {sales.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0"><span className="block font-medium md:truncate">V-{s.number} · {customerOf(s.customerId)}</span><span className="text-xs text-muted">{fdate(s.date)}</span></span>
                      <span className="tabular-nums">{money(saleTotals(db, s).revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "ventas" && (() => {
        const filtered = sales.filter((s) => matches(q, customerOf(s.customerId), s.number, ...s.items.map((i) => productName(i.productId))) && (!from || s.date >= from) && (!to || s.date <= to));
        const { rows, page, pages, total } = paginate(filtered, sp);
        return (
          <>
            <Filters sp={sp} dates searchPlaceholder="Buscar por cliente, producto o número" />
            <DataTable
              rows={rows} rowKey={(s) => s.id} emptyTitle="Sin ventas de Tienda Nube" emptyDescription={tn ? "Los pedidos pagados entran solos. Tocá “Sincronizar ahora” para traer los anteriores." : "Conectá la tienda para que los pedidos entren solos."}
              columns={[
                { key: "n", header: "N.º", render: (s) => `V-${s.number}` },
                { key: "d", header: "Fecha", render: (s) => fdate(s.date) },
                { key: "c", header: "Cliente", render: (s) => customerOf(s.customerId) },
                { key: "p", header: "Productos", render: (s) => <span className="text-xs">{s.items.map((i) => `${i.qty} × ${productName(i.productId)}`).join(" · ")}</span> },
                { key: "pm", header: "Pago", render: (s) => <span className="text-xs">{s.payMethod || "—"}</span> },
                { key: "b", header: "Bruto", align: "center", render: (s) => money(saleTotals(db, s).revenue) },
                { key: "f", header: "Cargos", align: "center", render: (s) => money(saleTotals(db, s).fees) },
                { key: "ne", header: "Neto", align: "center", render: (s) => <span className="font-medium">{money(saleTotals(db, s).net)}</span> },
                { key: "st", header: "Estado", render: (s) => <Badge fixed tone={s.status === "cancelada" ? "danger" : s.status === "entregado" ? "success" : "warning"}>{s.status}</Badge> },
              ]}
            />
            <Pager sp={sp} page={page} pages={pages} total={total} />
          </>
        );
      })()}

      {tab === "publicaciones" && (() => {
        const rows0 = forSale.map((p) => ({ p, l: p.listings?.find((l) => l.channel === CHANNEL) }));
        const shown = rows0
          .filter((r) => matches(q, r.p.name, r.p.sku) && (!stateF || (stateF === "none" ? !r.l : r.l?.status === stateF)))
          .sort((a, b) => (a.l ? 0 : 1) - (b.l ? 0 : 1) || (a.l?.status === "active" ? 0 : 1) - (b.l?.status === "active" ? 0 : 1) || a.p.name.localeCompare(b.p.name));
        const { rows, page, pages, total } = paginate(shown, sp);
        return (
          <>
            <Filters sp={sp} searchPlaceholder="Buscar producto" filters={[{ name: "estado", label: "Estado", options: [{ value: "active", label: "Publicado" }, { value: "out_of_stock", label: "Sin stock" }, { value: "paused", label: "Pausado" }, { value: "none", label: "Sin publicar en Tienda Nube" }] }]} />
            <DataTable
              rows={rows} rowKey={(r) => r.p.id} emptyTitle="Sin productos"
              columns={[
                { key: "p", header: "Producto", render: (r) => <div className="min-w-48"><p className="font-medium">{r.p.name}</p><p className="text-xs text-muted">{r.p.sku} · {r.p.category}</p></div> },
                { key: "s", header: "Estado", render: (r) => (r.l ? <Badge fixed="wide" tone={LISTING[r.l.status].tone}>{LISTING[r.l.status].label}</Badge> : <Badge fixed="wide">Sin publicar</Badge>) },
                { key: "pt", header: "Precio en la tienda", align: "center", render: (r) => (r.l ? money(r.l.price) : "—") },
                { key: "pc", header: "Precio catálogo", align: "center", render: (r) => <div>{money(r.p.price)}{r.l && r.l.price !== r.p.price && <p className="text-xs text-warning">distinto</p>}</div> },
                { key: "st", header: "Stock", align: "center", render: (r) => (r.p.unlimited ? <span className="font-semibold text-primary">∞</span> : r.p.trackStock !== false || r.p.components?.length ? int(stockOf(db, r.p.id)) : <span className="text-muted">—</span>) },
                { key: "ts", header: "Stock en la tienda", align: "center", render: (r) => { const v = live.get(r.p.id); return v ? (v.stock === null ? <span className="font-semibold text-primary">∞</span> : int(v.stock)) : <span className="text-muted">—</span>; } },
                { key: "u", header: "Link", render: (r) => (r.l?.url ? <a href={r.l.url} target="_blank" rel="noreferrer" title="Abrir la publicación en la tienda" className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary/40 bg-primary/5 px-2.5 text-xs font-medium text-primary hover:bg-primary/10">Ver en la tienda<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" /><path d="M11 3h6v6M17 3l-8 8" /></svg></a> : "—") },
                {
                  key: "a", header: "", render: (r) => {
                    const lv = live.get(r.p.id);
                    // Producto que ya existe en la tienda: el cambio se envía a Tienda Nube. Si no, solo se guarda en el CRM.
                    return lv ? (
                      <CreateDrawer
                        compact buttonLabel="Editar en la tienda" variant="secondary" title={`Tienda Nube: ${r.p.name}`} action={async (fd) => { "use server"; await updateTnProduct(lv.tnId, fd); }}
                        fields={[
                          { name: "status", label: "Estado en Tienda Nube", type: "select", defaultValue: lv.published ? "active" : "paused", options: [{ value: "active", label: "Publicado" }, { value: "paused", label: "Oculto (pausado)" }] },
                          { name: "price", label: "Precio en la tienda", type: "currency", defaultValue: r.l ? String(r.l.price) : "" },
                          { name: "stock", label: lv.stock === null ? "Stock (hoy: sin límite) — vacío = no cambiar" : "Stock en la tienda — vacío = no cambiar", type: "number", defaultValue: lv.stock === null ? "" : String(lv.stock) },
                        ]}
                      />
                    ) : (
                      <CreateDrawer
                        compact buttonLabel="Editar publicación" variant="secondary" title={`Tienda Nube: ${r.p.name}`} action={async (fd) => { "use server"; fd.set("channel", CHANNEL); await setListing(r.p.id, fd); }}
                        fields={[
                          { name: "status", label: "Estado en Tienda Nube (vacío = quitar)", type: "select", defaultValue: r.l?.status, options: [{ value: "active", label: "Publicado" }, { value: "out_of_stock", label: "Publicado, sin stock" }, { value: "paused", label: "Pausado" }] },
                          { name: "price", label: "Precio publicado (vacío = precio de venta)", type: "currency", defaultValue: r.l ? String(r.l.price) : "" },
                          { name: "url", label: "Link del producto", defaultValue: r.l?.url },
                        ]}
                      />
                    );
                  },
                },
              ]}
            />
            <Pager sp={sp} page={page} pages={pages} total={total} />
          </>
        );
      })()}

      {tab === "clientes" && (
        <DataTable
          rows={clients} rowKey={(c) => c.id} emptyTitle="Sin clientes de Tienda Nube" emptyDescription="Aparecen solos con cada pedido de la tienda."
          columns={[
            { key: "n", header: "Cliente", render: (c) => (() => {
              const bought = new Map<string, number>();
              for (const sale of db.sales.filter((x) => x.customerId === c.id && x.status !== "cancelada")) for (const i of sale.items) bought.set(i.productId, (bought.get(i.productId) ?? 0) + i.qty);
              const list = [...bought].map(([id, qty]) => ({ name: db.products.find((p) => p.id === id)?.name ?? "Producto", qty }));
              return (
                <div className="min-w-44"><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.doc ? `DNI/CUIT ${c.doc}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {list.slice(0, 2).map((b) => <span key={b.name} title={`${b.qty} × ${b.name}`} className="inline-flex max-w-[15rem] items-center gap-1 truncate rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted"><span className="font-semibold text-ink">{b.qty}×</span><span className="truncate">{b.name}</span></span>)}
                    {list.length > 2 && <span title={list.slice(2).map((b) => `${b.qty} × ${b.name}`).join("\n")} className="rounded bg-bg px-1.5 py-0.5 text-[11px] font-medium text-muted">+{list.length - 2}</span>}
                  </div>
                </div>
              );
            })() },
            { key: "c", header: "Contacto", render: (c) => <div><p>{c.phone || "—"}</p><p className="text-xs text-muted">{c.email}</p></div> },
            { key: "u", header: "Domicilio", render: (c) => <div className="max-w-56 text-sm"><p>{c.address || "—"}</p><p className="text-xs text-muted">{c.city}</p></div> },
            { key: "cn", header: "Compras", align: "center", render: (c) => int(db.sales.filter((s) => s.customerId === c.id && s.status !== "cancelada").length) },
            { key: "a", header: "", render: (c) => <ContactButtons name={c.name} phone={c.phone} email={c.email} /> },
          ]}
        />
      )}

      {tab === "envios" && (
        <DataTable
          rows={shipments} rowKey={(x) => x.id} emptyTitle="Sin envíos de Tienda Nube" emptyDescription="Cada venta de este canal entra sola en Envíos, en la etapa Compra."
          columns={[
            { key: "d", header: "Compra", render: (x) => fdate(x.createdAt) },
            { key: "c", header: "Cliente", render: (x) => <div><p className="font-medium">{x.customer || "—"}</p><p className="font-mono text-xs text-muted">{x.orderRef}</p></div> },
            { key: "p", header: "Productos", render: (x) => <span className="text-xs">{x.items || "—"}</span> },
            { key: "a", header: "Destino", render: (x) => <span className="text-xs">{[x.address, x.city].filter(Boolean).join(" · ") || "—"}</span> },
            { key: "e", header: "Etapa", render: (x) => { const st = stages.find((s) => s.id === x.stage); return <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: st?.color ?? "#94a3b8" }}>{st?.name ?? x.stage}</span>; } },
          ]}
        />
      )}
      {tn ? (
        <Guide title="¿Qué se carga solo desde Tienda Nube?">Los pedidos pagados, clientes, envíos y productos entran solos apenas ocurren en la tienda (y una vez por día se revisa todo de nuevo). El precio, el stock y el estado de cada producto se pueden cambiar desde la solapa Publicaciones y se envían a la tienda. El neto de cada venta es una estimación (descuenta {TN_FEE_PCT}% de cargos de cobro), porque Tienda Nube no informa lo que cobra el medio de pago.</Guide>
      ) : (
        <Guide title="¿Cómo cargo todo mientras no esté conectada?">Ventas: Stock → Cargar ventas (canal Tienda Nube). Publicaciones: botón “Editar publicación” de cada producto.</Guide>
      )}
    </div>
  );
}
