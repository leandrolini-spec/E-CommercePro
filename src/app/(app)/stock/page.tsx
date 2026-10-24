import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, Button, Input, KpiCard, Select } from "@/components/ui/primitives";
import { fdate, int, money, today } from "@/lib/format";
import { ITEM_STATUS, mlData, type MlItem } from "@/integrations/mercadolibre/data";
import { createStockMovement, registerSalesBulk, setProductStock } from "@/modules/actions";
import { TogglePanel } from "@/components/shared/TogglePanel";
import { StockInline } from "@/components/shared/StockInline";
import { tnLiveByProduct } from "@/integrations/tiendanube/data";
import { kitLimit, stockOf } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import { Guide } from "@/components/ui/Guide";

const CH_SHORT: Record<string, string> = { "Tienda Nube": "TN", "Mercado Libre": "ML" };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
const CHIP_TONE = { success: "bg-success/10 text-success", warning: "bg-warning/10 text-warning", info: "bg-info/10 text-info", danger: "bg-danger/10 text-danger", neutral: "bg-line/60 text-muted" } as const;
/** Etiqueta de publicación: siempre del mismo tamaño y con el texto centrado. */
function PubChip({ tone, label }: { tone: string; label: string }) {
  return <span className={`inline-flex h-6 w-full items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-medium ${CHIP_TONE[tone as keyof typeof CHIP_TONE] ?? CHIP_TONE.neutral}`}>{label}</span>;
}

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const sp = (await searchParams) as SearchParams;
  const dbP = getDb();
  const q = param(sp, "q"), state = param(sp, "state"), pub = param(sp, "pub"), cat = param(sp, "category"), chan = param(sp, "channel");
  const pid = isSupabase() ? await activeProjectId() : "";
  // Base, publicaciones de Mercado Libre y stock de Tienda Nube se piden al mismo tiempo.
  const [db, items, tnLive] = await Promise.all([
    dbP,
    pid ? mlData(pid, { messages: false }).then((m) => m.items).catch(() => [] as MlItem[]) : Promise.resolve([] as MlItem[]),
    pid ? tnLiveByProduct(pid).catch(() => new Map()) : Promise.resolve(new Map()),
  ]);

  // Lo que lleva control de stock: insumos, kits y todo producto que no tenga el control apagado.
  const all = db.products.filter((p) => p.kind !== "consumible" && p.active !== false && (p.trackStock !== false || p.unlimited || p.components?.length)).map((p) => {
    const stock = stockOf(db, p.id);
    const st = p.unlimited ? "Infinito" : stock <= 0 ? "Sin stock" : p.minStock > 0 && stock <= p.minStock ? "Bajo" : "Hay";
    const isSupply = p.kind === "componente";
    const listings = items.filter((i) => i.productId === p.id);
    const usedIn = db.products.filter((k) => k.components?.some((c) => c.productId === p.id));
    return { p, stock, st, isSupply, listings, usedIn, limit: kitLimit(db, p) };
  });
  const filtered = all.filter(
    (r) => matches(q, r.p.name, r.p.sku) && (!state || r.st === state) && (!cat || r.p.category === cat) &&
      (!chan || (chan === "Mercado Libre" ? r.listings.length > 0 : !!r.p.listings?.some((l) => l.channel === chan))) &&
      (!pub || (pub === "published" ? r.listings.some((l) => l.status === "active") || !!r.p.listings?.some((l) => l.status === "active") : !r.isSupply && !r.listings.length && !r.p.listings?.length)),
  );
  // Orden fijo, igual que en Productos: publicados arriba, luego en revisión, pausados / sin stock y por último los no publicados.
  const RANK: Record<string, number> = { active: 0, under_review: 1, paused: 2, out_of_stock: 2 };
  const bestRank = (r: (typeof all)[number]) => Math.min(3, ...[...r.listings.map((l) => l.status), ...(r.p.listings ?? []).map((l) => l.status)].map((st) => RANK[st] ?? 2));
  filtered.sort((x, y) => bestRank(x) - bestRank(y) || x.p.category.localeCompare(y.p.category) || x.p.name.localeCompare(y.p.name));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const tone = { "Sin stock": "danger", Bajo: "warning", Hay: "success", Infinito: "info" } as const;
  const valued = all.filter((r) => !r.p.components?.length).reduce((s, r) => s + Math.max(0, r.stock) * r.p.cost, 0);
  const recent = [...db.movements].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock" subtitle="Qué hay, dónde está publicado y vendido por qué canal. Los kits se arman solos con sus componentes."
        actions={
          <>
          <CreateDrawer
            variant="secondary" buttonLabel="Registrar movimiento" title="Movimiento de stock" action={createStockMovement}
            fields={[
              { name: "productId", label: "Producto", type: "select", required: true, options: db.products.filter((p) => !p.components?.length).map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` })) },
              { name: "type", label: "Tipo", type: "select", required: true, options: ["ingreso", "egreso", "ajuste", "devolucion", "perdida", "rotura", "merma"].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })) },
              { name: "direction", label: "Si es ajuste", type: "select", options: [{ value: "suma", label: "Suma" }, { value: "resta", label: "Resta" }] },
              { name: "qty", label: "Cantidad", type: "number", required: true }, { name: "reason", label: "Motivo" },
            ]}
          />
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Stock valorizado" value={money(valued)} hint="Al costo, sin contar los kits (ya están en sus componentes)" />
        <KpiCard label="Kits que se pueden armar" value={int(all.filter((r) => r.p.components?.length).reduce((s, r) => s + r.stock, 0))} />
        <KpiCard label="Sin stock" value={int(all.filter((r) => r.st === "Sin stock").length)} />
        <KpiCard label="Bajo mínimo" value={int(all.filter((r) => r.st === "Bajo").length)} />
      </section>
      <TogglePanel label="Cargar ventas" icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" /></svg>}>
        <form action={registerSalesBulk} className="space-y-4 rounded-lg border border-line bg-surface p-4">
          <Guide title="¿Cómo cargo las ventas?">Elegí el canal una sola vez y escribí cuántos se vendieron de cada producto. Dejá en blanco los que no se vendieron.</Guide>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted">Canal<Select name="channel" required defaultValue=""><option value="">Elegir…</option>{db.settings.channels.map((c) => <option key={c} value={c}>{c}</option>)}</Select></label>
            <label className="text-xs text-muted">Fecha<Input name="date" type="date" defaultValue={today()} /></label>
            <label className="text-xs text-muted">Forma de pago<Select name="payMethod" defaultValue=""><option value="">Elegir…</option>{db.settings.payMethods.map((m) => <option key={m} value={m}>{m}</option>)}</Select></label>
          </div>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {all.filter((r) => !r.isSupply).map((r) => (
              <label key={r.p.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate" title={r.p.name}>{r.p.name}</span>
                <input name={`q_${r.p.id}`} type="number" min="0" step="1" placeholder="0" className="w-16 shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-right" />
              </label>
            ))}
          </div>
          <Button type="submit">Guardar ventas</Button>
        </form>
      </TogglePanel>
      <div>
        <Filters sp={sp} searchPlaceholder="Buscar producto o SKU" filters={[
          { name: "state", label: "Estado", options: ["Sin stock", "Bajo", "Hay", "Infinito"] },
          { name: "pub", label: "Publicación", options: [{ value: "published", label: "Publicados" }, { value: "unpublished", label: "No publicados" }] },
          { name: "channel", label: "Canal", options: db.settings.channels },
          { name: "category", label: "Categoría", options: [...new Set(all.map((r) => r.p.category).filter(Boolean))] },
        ]} />
        <Guide className="mb-3" title="¿Qué significan ML, TN y el triángulo naranja?">En las tiendas: <strong className="text-ink">ML</strong> = Mercado Libre, <strong className="text-ink">TN</strong> = Tienda Nube (unidades disponibles hoy en cada publicación). Si la cantidad no coincide con la del CRM, el casillero se marca en naranja con <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-warning" aria-hidden><path d="M10 3 2 17h16L10 3Z" /><path d="M10 8v4M10 14.5h.01" /></svg> y “—” significa que no está publicado ahí.</Guide>
        <DataTable
          rows={rows} rowKey={(r) => r.p.id} emptyTitle="Sin resultados" emptyDescription="Probá con otros filtros."
          columns={[
            {
              key: "p", header: "Producto", render: (r) => (
                <div className="min-w-56 max-w-sm">
                  <p className="font-medium">{r.p.name}</p>
                  {!!r.p.components?.length && <p className="text-xs text-muted">Lleva: {r.p.components.map((c) => `${c.qty} × ${db.products.find((x) => x.id === c.productId)?.name ?? "—"}`).join(" · ")}</p>}
                  {r.limit && r.stock === 0 && <p className="text-xs text-danger">Falta: {r.limit.name} (hay {r.limit.have}, necesita {r.limit.need})</p>}
                  {r.limit && r.stock > 0 && <p className="text-xs text-muted">Limita: {r.limit.name} (hay {r.limit.have})</p>}
                  {r.usedIn.length > 0 && <p className="text-xs text-muted">Se usa en: {r.usedIn.map((k) => k.name).join(", ")}</p>}
                </div>
              ),
            },
            {
              key: "s", header: "Stock", align: "right", render: (r) => {
                const editable = !r.p.components?.length;
                return (
                  <div className="flex items-center justify-end gap-2">
                    {!editable && (r.p.unlimited ? <p className="text-2xl font-semibold leading-none text-primary" title="Stock infinito: siempre hay">∞</p> : <div className="text-right"><p className="text-base font-semibold">{int(r.stock)}</p><p className="text-xs text-muted">kits armables</p></div>)}
                    {editable && <StockInline value={r.stock} unlimited={!!r.p.unlimited} action={setProductStock.bind(null, r.p.id)} />}
                  </div>
                );
              },
            },
            { key: "st", header: "Estado", render: (r) => <Badge fixed tone={tone[r.st as keyof typeof tone]}>{r.st}</Badge> },
            {
              key: "ts", header: <span title="Unidades disponibles hoy en cada publicación de la tienda">En las tiendas</span>, render: (r) => {
                if (r.p.components?.length) return <span className="text-xs text-muted">—</span>;
                const ml = r.listings.filter((l) => l.status !== "closed");
                const mlQty = ml.length ? ml.reduce((s, l) => s + l.available, 0) : null;
                const tn = tnLive.get(r.p.id);
                type Chip = { key: string; label: string; name: string; value: string | null; diff: boolean };
                const chips: Chip[] = [
                  { key: "ml", label: "ML", name: "Mercado Libre", value: mlQty === null ? null : String(mlQty), diff: mlQty !== null && !r.p.unlimited && mlQty !== r.stock },
                  { key: "tn", label: "TN", name: "Tienda Nube", value: tn ? (tn.stock === null ? "∞" : String(tn.stock)) : null, diff: !!tn && !r.p.unlimited && tn.stock !== null && tn.stock !== r.stock },
                ];
                if (chips.every((c) => c.value === null)) return <span className="text-xs text-muted">—</span>;
                // Siempre dos casilleros iguales (ML y TN) para que todas las filas queden parejas.
                return (
                  <div className="flex items-center gap-1.5">
                    {chips.map((c) => (
                      <span
                        key={c.key}
                        title={c.value === null ? `No está publicado en ${c.name}` : c.diff ? `En ${c.name} hay ${c.value} y en el CRM ${int(r.stock)}: no coinciden` : `En ${c.name} hay ${c.value}`}
                        className={`inline-flex h-7 w-[5.75rem] items-center justify-between rounded-md border px-2 text-xs ${c.value === null ? "border-dashed border-line text-muted/50" : c.diff ? "border-warning/50 bg-warning/10 text-warning" : "border-line text-muted"}`}
                      >
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {c.label}
                          {c.diff && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden><path d="M10 3 2 17h16L10 3Z" /><path d="M10 8v4M10 14.5h.01" /></svg>}
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{c.value ?? "—"}</span>
                      </span>
                    ))}
                  </div>
                );
              },
            },
            {
              key: "w", header: "Dónde está publicado", render: (r) => (
                r.isSupply ? <Badge>Componente de kits (no se vende solo)</Badge> : r.listings.length || r.p.listings?.length ? (
                  <div className="flex flex-col gap-1">
                    {r.listings.map((l) => (
                      <a key={l.id} href={l.permalink} target="_blank" rel="noreferrer" title={`Mercado Libre · ${(ITEM_STATUS[l.status]?.label ?? l.status).toLowerCase()}`} className="grid grid-cols-[8.5rem_5.5rem] items-center gap-2">
                        <PubChip tone={ITEM_STATUS[l.status]?.tone ?? "neutral"} label={`ML · ${cap(ITEM_STATUS[l.status]?.label ?? l.status)}`} />
                        <span className="text-right text-xs tabular-nums text-muted">{money(l.price)}</span>
                      </a>
                    ))}
                    {r.p.listings?.map((l) => (
                      <a key={l.channel} href={l.url || undefined} target="_blank" rel="noreferrer" title={`${l.channel} · ${l.status === "active" ? "activa" : l.status === "out_of_stock" ? "sin stock" : "pausada"}`} className="grid grid-cols-[8.5rem_5.5rem] items-center gap-2">
                        <PubChip tone={l.status === "active" ? "success" : "warning"} label={`${CH_SHORT[l.channel] ?? l.channel} · ${l.status === "active" ? "Activa" : l.status === "out_of_stock" ? "Sin stock" : "Pausada"}`} />
                        <span className="text-right text-xs tabular-nums text-muted">{money(l.price)}</span>
                      </a>
                    ))}
                  </div>
                ) : <Badge>No publicado</Badge>
              ),
            },
          ]}
        />
        <Pager sp={sp} page={page} pages={pages} total={total} />
      </div>
      <section>
        <h2 className="mb-2 text-base font-semibold">Últimos movimientos</h2>
        <DataTable
          rows={recent} rowKey={(m) => m.id}
          columns={[
            { key: "d", header: "Fecha", render: (m) => fdate(m.date) },
            { key: "p", header: "Producto", render: (m) => db.products.find((p) => p.id === m.productId)?.name ?? "—" },
            { key: "t", header: "Tipo", render: (m) => <Badge fixed tone={m.qty > 0 ? "success" : "neutral"}>{m.type}</Badge> },
            { key: "q", header: "Cantidad", align: "right", render: (m) => (m.qty > 0 ? `+${m.qty}` : m.qty) },
            { key: "r", header: "Motivo", render: (m) => m.reason },
            { key: "f", header: "Referencia", render: (m) => m.ref ?? "—" },
          ]}
        />
      </section>
    </div>
  );
}
