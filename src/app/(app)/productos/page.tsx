import Link from "next/link";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { KitCheck, KitCheckAll, KitSelection } from "@/components/shared/KitSelection";
import { ActionButton, Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { ListingFlags } from "@/components/ui/ListingFlags";
import { Badge } from "@/components/ui/primitives";
import { int, money, pct } from "@/lib/format";
import { ITEM_STATUS, mlData, type MlItem } from "@/integrations/mercadolibre/data";
import { createProductFromListing, linkMlItem, updateMlItem } from "@/integrations/mercadolibre/actions";
import { createProduct, deleteKit, quickPrices, setListing, updateProduct } from "@/modules/actions";
import { kitLimit, saleTotals, stockOf } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import type { Listing, Product } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const PencilIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M13.6 2.9a1.8 1.8 0 0 1 2.5 2.5l-.9.9-2.5-2.5.9-.9ZM11.8 4.7l-7.5 7.5a1 1 0 0 0-.26.45l-.8 3a.5.5 0 0 0 .6.6l3-.8a1 1 0 0 0 .45-.26l7.5-7.5-2.99-2.99Z" /></svg>;
const MlIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm1 3.5a1 1 0 1 0-2 0v4a1 1 0 0 0 .3.7l2.5 2.5a1 1 0 0 0 1.4-1.4L11 9.6V6Z" /></svg>;
const ChannelsIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M4 4a2 2 0 1 1 3.9.6l4.2 2.4a2 2 0 1 1 0 2l-4.2 2.4A2 2 0 1 1 7 12.3l-.1-.3-2.9-1.7A2 2 0 0 1 4 4Z" /></svg>;

type Row = { id: string; product?: Product; item?: MlItem; listing?: Listing };
const LISTING_LABEL: Record<Listing["status"], { label: string; tone: "success" | "warning" }> = {
  active: { label: "Publicado", tone: "success" }, out_of_stock: { label: "Publicado · sin stock", tone: "warning" }, paused: { label: "Publicado · pausado", tone: "warning" },
};
/** Estado de publicación de una fila: de Mercado Libre (automático) o de otro canal (cargado a mano). */
const stateOf = (r: Row) => (r.item ? r.item.status : r.listing ? r.listing.status : "none");
const priceOf = (r: Row) => r.item?.price ?? r.listing?.price ?? r.product?.price ?? 0;

export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  const sp = (await searchParams) as SearchParams;
  const db = await getDb();
  const tab = ["kits", "componentes"].includes(param(sp, "tab")) ? "kits" : "venta";
  const channelF = param(sp, "channel"), statusF = param(sp, "status"), stockF = param(sp, "stock");
  const q = param(sp, "q"), cat = param(sp, "category"), show = param(sp, "show") || (param(sp, "cost") === "0" ? "nocost" : "");
  const items: MlItem[] = isSupabase() ? await mlData(await activeProjectId(), { messages: false }).then((m) => m.items).catch(() => []) : [];

  // Comisión de Mercado Libre: promedio real de tus ventas (bruto menos lo cobrado). Es una estimación, no un dato por publicación.
  const mlSales = db.sales.filter((s) => s.channel === "Mercado Libre" && s.status !== "cancelada" && s.netAmount != null).map((s) => saleTotals(db, s));
  const gross = mlSales.reduce((a, x) => a + x.revenue, 0);
  const feePct = gross > 0 ? (1 - mlSales.reduce((a, x) => a + x.net, 0) / gross) * 100 : 0;

  // Los productos "de relleno" (compras varias sin producto) están inactivos y no se listan.
  const forSale = db.products.filter((p) => (p.kind ?? "venta") === "venta" && p.active !== false && !p.components?.length);
  // Kits: productos que se arman con otros. Piezas: todo lo que lleva algún kit (o está marcado como componente), sea o no un producto que también se vende suelto.
  const kits = db.products.filter((p) => p.components?.length && p.active !== false);
  const components = db.products.filter((p) => p.kind === "componente" || kits.some((k) => k.components?.some((c) => c.productId === p.id)));
  const rows: Row[] = [];
  for (const p of forSale) {
    const mine = items.filter((i) => i.productId === p.id);
    for (const i of mine) rows.push({ id: `${p.id}:${i.id}`, product: p, item: i });
    for (const l of p.listings ?? []) rows.push({ id: `${p.id}:${l.channel}`, product: p, listing: l });
    if (!mine.length && !p.listings?.length) rows.push({ id: p.id, product: p });
  }
  for (const i of items.filter((x) => !x.productId || !db.products.some((p) => p.id === x.productId))) rows.push({ id: `ml:${i.id}`, item: i });

  // Sin stock: el producto lleva control y no tiene, o la publicación de ML no tiene disponibles, o la de otro canal figura sin stock.
  const noStock = (r: Row) => (!!r.product && !r.product.unlimited && r.product.trackStock !== false && stockOf(db, r.product.id) <= 0) || (!!r.item && r.item.available <= 0) || r.listing?.status === "out_of_stock";
  const linked = (r: Row) => !!r.product;
  const costMissing = (r: Row) => !!r.product && r.product.cost <= 0;
  const FILTERS: [string, string, (r: Row) => boolean][] = [
    ["", "Todos", () => true],
    ["published", "Publicados", (r) => stateOf(r) === "active"],
    ["paused", "Pausados / sin stock", (r) => stateOf(r) !== "active" && stateOf(r) !== "none"],
    ["unpublished", "Sin publicar en ningún canal", (r) => stateOf(r) === "none"],
    ["unlinked", "Sin vincular", (r) => !!r.item && !linked(r)],
    ["nostock", "Sin stock", noStock],
    ["nocost", "Sin costo", costMissing],
  ];
  const base = rows.filter((r) => matches(q, r.product?.name, r.product?.sku, r.item?.title, r.item?.id) && (!cat || r.product?.category === cat) && (!channelF || (r.item ? "Mercado Libre" : r.listing ? r.listing.channel : "Sin publicar") === channelF) && (!statusF || stateOf(r) === statusF) && (!stockF || (stockF === "sin" ? noStock(r) : !noStock(r))));
  // Orden fijo: publicados, en revisión, pausados (o sin stock) y por último los no publicados; dentro de cada grupo, por categoría y nombre.
  const RANK: Record<string, number> = { active: 0, under_review: 1, paused: 2, out_of_stock: 2, none: 3 };
  const byDefault = (x: Row, y: Row) => (RANK[stateOf(x)] ?? 2) - (RANK[stateOf(y)] ?? 2) || (x.product?.category ?? "").localeCompare(y.product?.category ?? "") || (x.product?.name ?? x.item?.title ?? "").localeCompare(y.product?.name ?? y.item?.title ?? "");
  // Stock para ordenar: infinito primero, después 0, 1, 2… (lo que no lleva control de stock va al final).
  const stockKey = (r: Row) => (r.product?.unlimited ? -1 : r.item ? r.item.available : r.product && r.product.trackStock !== false ? stockOf(db, r.product.id) : Number.POSITIVE_INFINITY);
  const orden = param(sp, "orden");
  const stockDiff = (x: Row, y: Row) => { const d = stockKey(x) - stockKey(y); return Number.isNaN(d) ? 0 : d; };
  const rankDiff = (x: Row, y: Row) => (RANK[stateOf(x)] ?? 2) - (RANK[stateOf(y)] ?? 2);
  // Por defecto: publicados primero y, dentro de cada grupo, stock infinito, 0, 1, 2… Las otras opciones ordenan solo por stock.
  const sorter = (x: Row, y: Row) => {
    if (orden === "stock") return stockDiff(x, y) || byDefault(x, y);
    if (orden === "stock_desc") return -stockDiff(x, y) || byDefault(x, y);
    return rankDiff(x, y) || stockDiff(x, y) || byDefault(x, y);
  };
  const filtered = base
    .filter(FILTERS.find((f) => f[0] === show)?.[2] ?? (() => true))
    // Orden: por la columna elegida (Canal, Estado o Stock) y, si no hay, publicados primero, luego en revisión, pausados y no publicados.
    .sort(sorter);
  const { rows: page_, page, pages, total } = paginate(filtered, sp);

  const categories = [...new Set([...db.settings.categories, ...forSale.map((p) => p.category)].filter(Boolean))];
  const productFields = (p?: Product) => {
    const sellable = !p || (p.kind ?? "venta") === "venta";
    const canKit = !!p && (p.kind ?? "venta") === "venta";
    const isKit = !!p?.components?.length;
    const others = db.products.filter((x) => x.id !== p?.id).map((x) => ({ value: x.id, label: x.name }));
    return [
      { name: "name", label: "Nombre", required: true, defaultValue: p?.name, section: "Datos del producto" },
      { name: "sku", label: "SKU", required: true, defaultValue: p?.sku, half: true },
      { name: "brand", label: "Marca", defaultValue: p?.brand, half: true },
      ...(p ? [{ name: "description", label: "Descripción", type: "textarea" as const, defaultValue: p.description }] : []),
      { name: "category", label: "Categoría", help: "Elegí una o escribí una nueva.", defaultValue: p?.category, suggestions: categories, half: true },
      { name: "kind", label: "Tipo", type: "select" as const, defaultValue: p?.kind ?? "venta", half: true, options: [{ value: "venta", label: "Se vende" }, { value: "componente", label: "Pieza de kits (no se vende sola)" }, { value: "consumible", label: "Insumo de la empresa" }] },

      { name: "cost", label: p?.components?.length ? "Costo (automático)" : "Costo", type: "currency" as const, defaultValue: p ? String(p.cost) : undefined, half: true, section: "Precio" },
      { name: "price", label: "Precio de venta", type: "currency" as const, required: true, defaultValue: p ? String(p.price) : undefined, half: true },

      { name: "stockMode", label: "Control de stock", type: "select" as const, defaultValue: p ? (p.unlimited ? "infinito" : p.trackStock === false ? "sin" : "controlado") : "controlado", section: "Stock", help: "Para cambiar cuántas unidades hay, usá la sección Stock.",
        options: [{ value: "controlado", label: "Controlado: llevo la cuenta" }, { value: "infinito", label: "Infinito: siempre hay (productos)" }, { value: "sin", label: "Sin control" }] },
      { name: "minStock", label: "Stock mínimo", type: "number" as const, defaultValue: p ? String(p.minStock) : "0", half: true, help: "Avisa cuando baja de este número.", showIf: [{ field: "stockMode", equals: "controlado" }] },
      { name: "maxStock", label: "Stock máximo", type: "number" as const, defaultValue: p ? String(p.maxStock) : "0", half: true, showIf: [{ field: "stockMode", equals: "controlado" }] },

      ...(canKit ? [
        { name: "isKit", label: "¿Es un kit?", type: "select" as const, defaultValue: isKit ? "si" : "no", section: "Kit", help: "Un kit se arma con otros productos del catálogo y su stock sale de lo que lleva. También podés armarlos tildando productos en la lista y usando “Crear kit de venta”.",
          options: [{ value: "no", label: "No, es un producto simple" }, { value: "si", label: "Sí, lleva otros productos" }] },
        ...[1, 2, 3, 4, 5].flatMap((i) => [
          { name: `comp${i}`, label: `Producto ${i}`, type: "select" as const, defaultValue: p?.components?.[i - 1]?.productId, options: others, half: true, showIf: [{ field: "isKit", equals: "si" }, ...(i > 1 ? [{ field: `comp${i - 1}`, filled: true }] : [])] },
          { name: `qty${i}`, label: "Cantidad", type: "number" as const, defaultValue: p?.components?.[i - 1] ? String(p.components[i - 1].qty) : "", half: true, showIf: [{ field: "isKit", equals: "si" }, ...(i > 1 ? [{ field: `comp${i - 1}`, filled: true }] : [])] },
        ]),
      ] : []),

      { name: "supplierId", label: "Proveedor", type: "select" as const, defaultValue: p?.supplierId, options: db.suppliers.map((x) => ({ value: x.id, label: x.name })), section: sellable ? "Más datos" : "Datos adicionales" },
      ...(p ? [
        { name: "packSize", label: "Productos por pack", type: "number" as const, defaultValue: p.packSize ? String(p.packSize) : "", half: true, help: "Vacío si no es un pack." },
        { name: "active", label: "¿Está activo?", type: "select" as const, defaultValue: p.active === false ? "no" : "si", half: true, options: [{ value: "si", label: "Sí" }, { value: "no", label: "No (se oculta)" }] },
      ] : []),
    ];
  };
  const tabHref = (t: string) => `?tab=${t}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos" subtitle="Cada fila es un producto en un canal: estado, precio publicado, costo y ganancia por venta"
        actions={<CreateDrawer buttonLabel="Nuevo producto" title="Nuevo producto" action={createProduct} fields={productFields()} />}
      />
      <nav className="flex gap-1.5" aria-label="Tipo">
        {([["venta", `Para vender (${forSale.length})`], ["kits", `Kits (${kits.length})`]] as const).map(([k, label]) => (
          <Link key={k} href={tabHref(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "venta" ? (
        <KitSelection products={forSale.map((p) => ({ id: p.id, name: p.name, price: p.price }))}>
          <nav className="flex flex-wrap gap-2" aria-label="Estado de publicación">
            {FILTERS.map(([k, label, fn]) => {
              const n = base.filter(fn).length;
              const on = k === show;
              const u = new URLSearchParams();
              for (const [kk, vv] of Object.entries(sp)) if (kk !== "show" && kk !== "page" && vv) u.set(kk, Array.isArray(vv) ? vv[0] : vv);
              if (k) u.set("show", k);
              return (
                <Link key={k || "all"} href={`?${u}`} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
                  {label} <span className={`ml-1 rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-bg"}`}>{n}</span>
                </Link>
              );
            })}
          </nav>
          <Filters sp={sp} searchPlaceholder="Buscar por producto, SKU o publicación" filters={[
            { name: "category", label: "Categoría", options: categories },
            { name: "channel", label: "Canal", options: [...db.settings.channels, "Sin publicar"] },
            { name: "status", label: "Estado", options: [{ value: "active", label: "Publicado" }, { value: "under_review", label: "En revisión" }, { value: "paused", label: "Pausado" }, { value: "out_of_stock", label: "Sin stock (otros canales)" }, { value: "none", label: "Sin publicar" }] },
            { name: "stock", label: "Stock", options: [{ value: "con", label: "Con stock" }, { value: "sin", label: "Sin stock" }] },
            { name: "orden", label: "Orden", allLabel: "Publicados primero, luego stock", options: [{ value: "stock", label: "Solo stock: infinito, 0, 1, 2…" }, { value: "stock_desc", label: "Solo stock: de mayor a menor" }] },
          ]} />
          <Guide title="¿Cómo se calcula la ganancia?">Ganancia por venta = precio publicado − costo − comisión de Mercado Libre ({feePct.toFixed(1).replace(".", ",")} %, el promedio real de tus ventas). Es una estimación.</Guide>
          <DataTable
            rows={page_} rowKey={(r) => r.id} emptyTitle="Sin resultados" emptyDescription="Probá con otros filtros o cargá un producto nuevo."
            columns={[
              { key: "sel", header: <KitCheckAll ids={page_.flatMap((r) => (r.product ? [r.product.id] : []))} />, render: (r) => (r.product && page_.find((x) => x.product?.id === r.product?.id) === r ? <KitCheck id={r.product.id} name={r.product.name} /> : null) },
              {
                key: "p", header: "Producto", render: (r) => (
                  <div className="min-w-56 max-w-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stateOf(r) === "active" ? "bg-success" : stateOf(r) === "none" ? "bg-line" : "bg-warning"}`} aria-hidden />
                      {r.product?.name ?? r.item?.title}
                    </p>
                    {r.product && r.item && <p className="truncate text-xs text-muted" title={r.item.title}>Publicación: {r.item.title}</p>}
                    {!!r.product?.components?.length && <p className="text-xs text-muted">Lleva: {r.product.components.map((c) => `${c.qty} × ${db.products.find((x) => x.id === c.productId)?.name ?? "—"}`).join(" · ")}</p>}
                    <p className="text-xs text-muted">{r.product ? `${r.product.sku} · ${r.product.category || "Sin categoría"}` : <Badge tone="warning">Sin producto vinculado</Badge>}</p>
                  </div>
                ),
              },
              { key: "c", header: "Canal", render: (r) => (r.item ? <div><p>Mercado Libre</p><a href={r.item.permalink} target="_blank" rel="noreferrer" className="text-xs text-primary">{r.item.id} ↗</a></div> : r.listing ? <div><p>{r.listing.channel}</p>{r.listing.url && <a href={r.listing.url} target="_blank" rel="noreferrer" className="text-xs text-primary">Ver publicación ↗</a>}</div> : <span className="text-muted">Ningún canal</span>) },
              { key: "s", header: "Estado", render: (r) => (r.item ? <div className="flex flex-col items-start gap-1"><Badge fixed="wide" tone={ITEM_STATUS[r.item.status]?.tone ?? "neutral"}>{r.item.status === "active" ? "Publicado" : `Publicado · ${(ITEM_STATUS[r.item.status]?.label ?? r.item.status).toLowerCase()}`}</Badge><ListingFlags item={r.item} /></div> : r.listing ? <Badge fixed="wide" tone={LISTING_LABEL[r.listing.status].tone}>{LISTING_LABEL[r.listing.status].label}</Badge> : <Badge fixed="wide">Sin publicar</Badge>) },
              { key: "st", header: "Stock", align: "center", render: (r) => <div>{r.item && <p>ML: {int(r.item.available)}</p>}{r.product?.unlimited && <p className="text-base font-semibold text-primary" title="Stock infinito: siempre hay">∞ <span className="text-xs font-medium">Infinito</span></p>}{r.product && r.product.trackStock !== false && !r.product.unlimited && <p className="text-xs text-muted">Propio: {int(stockOf(db, r.product.id))}</p>}</div> },
              { key: "pp", header: "Precio publicado", align: "center", render: (r) => (r.item ? <div><p className="font-medium">{money(r.item.price)}</p>{r.item.originalPrice && <p className="text-xs text-muted line-through">{money(r.item.originalPrice)}</p>}</div> : r.listing ? <p className="font-medium">{money(r.listing.price)}</p> : <span className="text-muted">—</span>) },
              { key: "pv", header: "Precio catálogo", align: "center", render: (r) => (r.product ? money(r.product.price) : "—") },
              { key: "co", header: "Costo", align: "center", render: (r) => (r.product ? (r.product.cost > 0 ? money(r.product.cost) : <Badge tone="warning">Sin costo</Badge>) : "—") },
              {
                key: "g", header: "Ganancia por venta", align: "center", render: (r) => {
                  const price = priceOf(r);
                  if (!r.product || r.product.cost <= 0 || price <= 0) return <span className="text-muted">—</span>;
                  const fee = r.item ? (price * feePct) / 100 : 0;
                  const gain = price - fee - r.product.cost;
                  const g = (gain / price) * 100;
                  return <div><p className="font-medium">{money(gain)}</p><Badge tone={g < 15 ? "danger" : g < 30 ? "warning" : "success"}>{pct(g)}</Badge></div>;
                },
              },
              { key: "v", header: "Visitas y ventas", align: "center", render: (r) => (r.item ? <div><p>{int(r.item.visits)} visitas</p><p className="text-xs text-muted">{int(r.item.sold)} vendidas</p></div> : "—") },
              {
                key: "tg", header: "Avisos", render: (r) => {
                  const price = priceOf(r);
                  const g = r.product && r.product.cost > 0 && price > 0 ? ((price - (r.item ? (price * feePct) / 100 : 0) - r.product.cost) / price) * 100 : null;
                  const tags: [string, "warning" | "danger" | "info"][] = [];
                  if (r.item && !r.product) tags.push(["Sin vincular", "warning"]);
                  if (r.product && r.product.cost <= 0) tags.push(["Falta costo", "warning"]);
                  if (g != null && g < 15) tags.push(["Margen bajo", "danger"]);
                  if (r.item?.status === "active" && r.item.available <= 0) tags.push(["Sin stock en ML", "danger"]);
                  if ((r.item || r.listing) && r.product && priceOf(r) !== r.product.price) tags.push(["Precio distinto al catálogo", "info"]);
                  return tags.length ? <div className="flex max-w-48 flex-wrap gap-1">{tags.map(([t, tone]) => <Badge key={t} tone={tone}>{t}</Badge>)}</div> : <Badge tone="success">Todo en orden</Badge>;
                },
              },
              {
                key: "a", header: "", render: (r) => (
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    {r.product && r.product.cost <= 0 && (
                      <CreateDrawer compact buttonLabel="Cargar costo" className="bg-warning! text-white! hover:opacity-90!" title={`Costo de ${r.product.name}`} action={quickPrices.bind(null, r.product.id)} fields={[{ name: "cost", label: "Costo (por unidad o por pack)", type: "currency", required: true }]} />
                    )}
                    {r.item && ["active", "paused"].includes(r.item.status) && (
                      <CreateDrawer
                        compact icon={MlIcon} buttonLabel="Editar en ML" variant="secondary" className="border-[#f59e0b]/60! bg-[#f59e0b]/10! text-[#b45309]! hover:bg-[#f59e0b]/25!" title={`Editar en Mercado Libre: ${r.item.id}`} action={updateMlItem.bind(null, r.item.id)}
                        fields={[
                          { name: "price", label: `Precio publicado (hoy ${money(r.item.price)})`, type: "currency", defaultValue: String(r.item.price) },
                          { name: "available", label: `Stock disponible en la publicación (hoy ${r.item.available})`, type: "number", defaultValue: String(r.item.available) },
                          { name: "status", label: "Estado (este cambio se envía a Mercado Libre al guardar)", type: "select", defaultValue: r.item.status, options: [{ value: "active", label: "Activa" }, { value: "paused", label: "Pausada" }] },
                        ]}
                      />
                    )}
                    {r.product && (
                      <CreateDrawer
                        compact icon={ChannelsIcon} buttonLabel="Canales" variant="secondary" title={`Canales de ${r.product.name}`} action={setListing.bind(null, r.product.id)}
                        fields={[
                          { name: "channel", label: "Canal (Tienda Nube, Instagram, Meta…)", type: "select", required: true, defaultValue: r.listing?.channel, options: db.settings.channels.filter((c) => c !== "Mercado Libre").map((c) => ({ value: c, label: c })) },
                          { name: "status", label: "Estado en ese canal (vacío = quitar la publicación)", type: "select", defaultValue: r.listing?.status, options: [{ value: "active", label: "Publicado" }, { value: "out_of_stock", label: "Publicado, sin stock" }, { value: "paused", label: "Pausado" }] },
                          { name: "price", label: "Precio publicado (vacío = precio de venta)", type: "currency", defaultValue: r.listing ? String(r.listing.price) : "" },
                          { name: "url", label: "Link de la publicación", defaultValue: r.listing?.url },
                        ]}
                      />
                    )}
                    {r.product && <CreateDrawer compact icon={PencilIcon} buttonLabel="Editar" title={`Editar: ${r.product.name}`} variant="secondary" action={updateProduct.bind(null, r.product.id)} fields={productFields(r.product)} />}
                    {r.item && !r.product && (
                      <CreateDrawer
                        compact buttonLabel="Crear producto" title="Crear producto desde esta publicación" action={createProductFromListing.bind(null, r.item.id)}
                        fields={[
                          { name: "name", label: "Nombre del producto", required: true, defaultValue: r.item.title },
                          { name: "category", label: "Categoría (elegí una o escribí una nueva)", defaultValue: "", suggestions: categories },
                          { name: "cost", label: "Costo (por unidad o por pack)", type: "currency" },
                          { name: "price", label: "Precio de venta", type: "currency", defaultValue: String(r.item.price) },
                          { name: "trackStock", label: "¿Lleva control de stock?", type: "select", defaultValue: "no", options: [{ value: "si", label: "Sí" }, { value: "no", label: "No" }] },
                        ]}
                      />
                    )}
                    {r.item && !r.product && (
                      <CreateDrawer
                        compact buttonLabel="Vincular" title="Vincular con un producto" variant="secondary" action={linkMlItem.bind(null, r.item.id)}
                        fields={[{ name: "productId", label: "Producto del catálogo", type: "select", required: true, options: forSale.map((p) => ({ value: p.id, label: p.name })) }]}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pager sp={sp} page={page} pages={pages} total={total} />
        </KitSelection>
      ) : tab === "kits" ? (
        <>
          <Guide title="¿Cómo funcionan los kits?">Los kits de venta: cuánto cuesta armarlo, dónde está publicado y cuántos se pueden armar. Lo que lleva cada uno y su descripción están adentro de Editar. Para crear uno nuevo, tildá los productos en la solapa “Para vender” y tocá “Crear kit de venta”.</Guide>
          <h2 className="text-base font-semibold">Kits ({kits.length})</h2>
          <DataTable
            rows={kits} rowKey={(k) => k.id} emptyTitle="Todavía no hay kits" emptyDescription="En “Para vender”, tildá los cuadraditos de 2 o más productos y tocá “Crear kit de venta”."
            columns={[
              { key: "k", header: "Kit", render: (k) => <div className="min-w-48 max-w-xs"><p className="font-medium">{k.name}</p><p className="text-xs text-muted">{k.sku}</p></div> },
              { key: "co", header: "Costo del kit", align: "center", render: (k) => money(k.cost) },
              { key: "pr", header: "Precio de venta", align: "center", render: (k) => (k.price > 0 ? money(k.price) : "—") },
              { key: "g", header: "Ganancia", align: "center", render: (k) => (k.price > 0 && k.cost > 0 ? <div><p className="font-medium">{money(k.price - k.cost)}</p><p className="text-xs text-muted">{pct(((k.price - k.cost) / k.price) * 100)}</p></div> : "—") },
              {
                key: "pub", header: "Publicado en", render: (k) => {
                  const its = items.filter((i) => i.productId === k.id);
                  return its.length || k.listings?.length ? (
                    <div className="flex flex-col items-start gap-1">
                      {its.map((i) => <Badge key={i.id} tone={ITEM_STATUS[i.status]?.tone ?? "neutral"}>Mercado Libre · {(ITEM_STATUS[i.status]?.label ?? i.status).toLowerCase()}</Badge>)}
                      {k.listings?.map((l) => <Badge key={l.channel} tone={l.status === "active" ? "success" : "warning"}>{l.channel} · {l.status === "active" ? "activa" : l.status === "out_of_stock" ? "sin stock" : "pausada"}</Badge>)}
                    </div>
                  ) : <Badge>Sin publicar</Badge>;
                },
              },
              {
                key: "ar", header: "Se pueden armar", align: "center", render: (k) => {
                  const n = stockOf(db, k.id), lim = kitLimit(db, k);
                  return <div><p className={`text-base font-semibold ${n > 0 ? "text-success" : "text-danger"}`}>{int(n)}</p>{lim && <p className="text-xs text-muted">{n > 0 ? "Limita" : "Falta"}: {lim.name}</p>}</div>;
                },
              },
              {
                key: "a", header: "", render: (k) => (
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    <CreateDrawer
                      compact icon={ChannelsIcon} buttonLabel="Canales" variant="secondary" title={`Canales de ${k.name}`} action={setListing.bind(null, k.id)}
                      fields={[
                        { name: "channel", label: "Canal (Tienda Nube, Instagram, Meta…)", type: "select", required: true, options: db.settings.channels.filter((c) => c !== "Mercado Libre").map((c) => ({ value: c, label: c })) },
                        { name: "status", label: "Estado en ese canal (vacío = quitar la publicación)", type: "select", options: [{ value: "active", label: "Publicado" }, { value: "out_of_stock", label: "Publicado, sin stock" }, { value: "paused", label: "Pausado" }] },
                        { name: "price", label: "Precio publicado (vacío = precio de venta)", type: "currency" },
                        { name: "url", label: "Link de la publicación" },
                      ]}
                    />
                    <CreateDrawer compact icon={PencilIcon} buttonLabel="Editar" title={`Editar: ${k.name}`} variant="secondary" action={updateProduct.bind(null, k.id)} fields={productFields(k)} />
                    <ActionButton action={deleteKit.bind(null, k.id)} label="Deshacer kit" variant="danger" />
                  </div>
                ),
              },
            ]}
          />
          <h2 className="pt-2 text-base font-semibold">Piezas ({components.length})</h2>
          <DataTable
            rows={components} rowKey={(p) => p.id} emptyTitle="Sin piezas"
            columns={[
              { key: "n", header: "Pieza", render: (p) => <div className="min-w-48"><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.sku}</p></div> },
              {
                key: "u", header: "Se usa en", render: (p) => (
                  <ul className="space-y-0.5 text-xs">
                    {kits.filter((k) => k.components?.some((c) => c.productId === p.id)).map((k) => <li key={k.id}>{k.components!.find((c) => c.productId === p.id)!.qty} × en {k.name}</li>)}
                    {!kits.some((k) => k.components?.some((c) => c.productId === p.id)) && <li className="text-muted">Ningún kit todavía</li>}
                  </ul>
                ),
              },
              { key: "c", header: "Costo por unidad", align: "center", render: (p) => money(p.cost) },
              { key: "s", header: "Stock suelto", align: "center", render: (p) => int(stockOf(db, p.id)) },
              { key: "v", header: "Valor en stock", align: "center", render: (p) => money(stockOf(db, p.id) * p.cost) },
              { key: "a", header: "", render: (p) => <CreateDrawer compact icon={PencilIcon} buttonLabel="Editar" title={`Editar: ${p.name}`} variant="secondary" action={updateProduct.bind(null, p.id)} fields={productFields(p)} /> },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
