import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { ContactButtons } from "@/components/shared/ContactButtons";
import { InfoCardButton } from "@/components/shared/InfoCardButton";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, int, money } from "@/lib/format";
import { createSupplier, deleteSupplier, updateSupplier } from "@/modules/actions";
import { purchaseTotal } from "@/modules/calc";
import { getDb } from "@/modules/data";
import type { Supplier } from "@/modules/types";

/** Rubros que se sugieren al cargar un proveedor (se pueden escribir otros: se suman solos). */
const DEFAULT_CATEGORIES = ["Productos", "Semillas", "Macetas y herramientas", "Embalaje", "Librería", "Transporte y logística", "Combustible", "Servicios (contador, dominio…)", "Otros"];

const PencilIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M13.6 2.9a1.8 1.8 0 0 1 2.5 2.5l-.9.9-2.5-2.5.9-.9ZM11.8 4.7l-7.5 7.5a1 1 0 0 0-.26.45l-.8 3a.5.5 0 0 0 .6.6l3-.8a1 1 0 0 0 .45-.26l7.5-7.5-2.99-2.99Z" /></svg>;
const PinIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path fillRule="evenodd" d="M10 18s6-5.2 6-9.5a6 6 0 1 0-12 0C4 12.8 10 18 10 18Zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" /></svg>;

/** Días desde una fecha (para "hace N d"). */
const daysSince = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));

/** Dirección web lista para abrir: acepta "https://…", "sitio.com", "instagram.com/…" o un "@usuario" de Instagram. */
function webUrl(site?: string): string | null {
  const t = (site ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("@")) return `https://www.instagram.com/${t.slice(1)}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return null;
}

export default async function ProveedoresPage({ searchParams }: PageProps<"/proveedores">) {
  const sp = (await searchParams) as SearchParams;
  const db = await getDb();
  const q = param(sp, "q"), cat = param(sp, "category"), city = param(sp, "city");
  const categories = [...new Set([...DEFAULT_CATEGORIES, ...db.suppliers.map((s) => s.category).filter(Boolean)])] as string[];
  const used = [...new Set(db.suppliers.map((s) => s.category).filter(Boolean))] as string[];
  const cities = [...new Set(db.suppliers.map((s) => s.city).filter(Boolean))] as string[];
  const filtered = db.suppliers
    .filter((s) => matches(q, s.name, s.company, s.contactName, s.cuit, s.email, s.phone, s.city, s.address, s.notes, s.category) && (!cat || s.category === cat) && (!city || s.city === city))
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const bought = (s: Supplier) => db.purchases.filter((b) => b.supplierId === s.id && b.status !== "cancelada");

  const fields = (s?: Supplier) => [
    { name: "name", label: "Nombre del proveedor", required: true, defaultValue: s?.name },
    { name: "category", label: "Categoría o rubro (elegí una o escribí una nueva)", defaultValue: s?.category, suggestions: categories },
    { name: "contactName", label: "Persona de contacto", defaultValue: s?.contactName },
    { name: "phone", label: "WhatsApp / teléfono", defaultValue: s?.phone },
    { name: "email", label: "Correo electrónico", type: "email" as const, defaultValue: s?.email },
    { name: "company", label: "Razón social / empresa", defaultValue: s?.company },
    { name: "cuit", label: "CUIT", defaultValue: s?.cuit },
    { name: "address", label: "Dirección", defaultValue: s?.address },
    { name: "city", label: "Ciudad y provincia", defaultValue: s?.city },
    { name: "website", label: "Sitio web o Instagram", defaultValue: s?.website },
    { name: "leadDays", label: "Tiempo de entrega (días)", type: "number" as const, defaultValue: s?.leadDays ? String(s.leadDays) : "" },
    { name: "payTerms", label: "Condiciones de pago", defaultValue: s?.payTerms },
    { name: "notes", label: "Notas y observaciones", type: "textarea" as const, defaultValue: s?.notes },
  ];
  const mapLink = (s: Supplier) => (s.address || s.city ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.address, s.city].filter(Boolean).join(", "))}` : null);
  const btn = "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proveedores" subtitle="Agenda de contactos y referencias: a quién le comprás, cómo contactarlo y dónde está"
        actions={<CreateDrawer buttonLabel="Nuevo proveedor" title="Nuevo proveedor" action={createSupplier} fields={fields()} />}
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard large aligned label="Proveedores" value={int(db.suppliers.length)} hint="En la agenda" />
        <KpiCard large aligned label="Rubros" value={int(used.length)} hint={used.slice(0, 3).join(" · ") || "Todavía sin categoría"} />
        <KpiCard large aligned label="Con WhatsApp cargado" value={int(db.suppliers.filter((s) => s.phone).length)} hint="Para escribirles con un toque" />
      </section>
      <Filters sp={sp} searchPlaceholder="Buscar por nombre, contacto, rubro, ciudad o notas" filters={[{ name: "category", label: "Categoría", options: used }, { name: "city", label: "Ciudad", options: cities }]} />
      <DataTable
        compact rows={rows} rowKey={(s) => s.id} emptyTitle="Sin proveedores" emptyDescription="Cargá el primero con “Nuevo proveedor”."
        columns={[
          {
            key: "n", header: "Proveedor", render: (s) => (
              <div className="min-w-44">
                {webUrl(s.website)
                  ? <a href={webUrl(s.website)!} target="_blank" rel="noreferrer" title={`Abrir ${s.website}`} className="inline-flex items-center gap-1 text-sm font-medium leading-snug text-primary hover:underline">{s.name}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden><path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" /><path d="M11 3h6v6M17 3l-8 8" /></svg></a>
                  : <p className="text-sm font-medium leading-snug">{s.name}</p>}
                <p className="text-[11px] text-muted">{[s.contactName && `Contacto: ${s.contactName}`, s.company].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            ),
          },
          { key: "cat", header: "Categoría", render: (s) => (s.category ? <span className="inline-flex whitespace-nowrap rounded-full bg-line/60 px-2.5 py-0.5 text-[11px] font-medium text-muted">{s.category}</span> : <span className="text-muted">—</span>) },
          { key: "c", header: "Contacto", render: (s) => <div><p className="whitespace-nowrap">{s.phone || "—"}</p><p className="max-w-44 truncate text-[11px] text-muted" title={s.email}>{s.email}</p></div> },
          { key: "hc", header: "Compras", align: "center", render: (s) => <div className="whitespace-nowrap"><p className="font-medium">{int(bought(s).length)}</p><p className="text-[11px] text-muted">{money(bought(s).filter((b) => b.status === "recibida").reduce((t, b) => t + purchaseTotal(b), 0))}</p></div> },
          { key: "lp", header: "Última compra", render: (s) => { const d = bought(s).map((b) => b.date).sort().at(-1); return <div className="whitespace-nowrap"><p className="font-medium">{d ? fdate(d) : "—"}</p><p className="text-[11px] text-muted">{d ? (daysSince(d) === 0 ? "hoy" : `hace ${daysSince(d)} d`) : "sin compras"}</p></div>; } },
          {
            key: "a", header: "", render: (s) => {
              const map = mapLink(s);
              const total = bought(s).filter((b) => b.status === "recibida").reduce((t, b) => t + purchaseTotal(b), 0);
              return (
                <div className="flex items-center justify-end gap-1">
                  <InfoCardButton title={s.name} label="Ver datos del proveedor" medium>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {s.category && <Badge>{s.category}</Badge>}
                        {s.leadDays ? <span className="text-xs text-muted">Entrega en {s.leadDays} días</span> : null}
                      </div>
                      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                        {([["Contacto", s.contactName], ["Razón social", s.company], ["CUIT", s.cuit], ["Teléfono", s.phone], ["Email", s.email], ["Sitio / Instagram", s.website], ["Dirección", s.address], ["Ciudad", s.city], ["Pago", s.payTerms]] as [string, string | undefined][]).map(([k, v]) => (
                          <div key={k} className="contents"><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="break-words">{k === "Sitio / Instagram" && webUrl(v) ? <a href={webUrl(v)!} target="_blank" rel="noreferrer" className="text-primary underline">{v}</a> : (v || "—")}</dd></div>
                        ))}
                      </dl>
                      <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-bg p-2.5 text-center">
                        <div><p className="text-[11px] uppercase tracking-wide text-muted">Compras</p><p className="font-semibold">{int(bought(s).length)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-muted">Total</p><p className="font-semibold">{money(total)}</p></div>
                        <div><p className="text-[11px] uppercase tracking-wide text-muted">Última</p><p className="font-semibold">{(() => { const d = bought(s).map((b) => b.date).sort().at(-1); return d ? fdate(d) : "—"; })()}</p></div>
                      </div>
                      {s.notes && <p className="whitespace-pre-wrap rounded-md border border-line p-2.5 text-xs text-muted">{s.notes}</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <ContactButtons name={s.contactName || s.name} phone={s.phone} email={s.email} />
                        {map && <a href={map} target="_blank" rel="noreferrer" className={`${btn} border-[#dc2626]/40 bg-[#dc2626]/10 text-[#b91c1c] hover:bg-[#dc2626]/20`}>{PinIcon}Mapa</a>}
                      </div>
                    </div>
                  </InfoCardButton>
                  <ContactButtons name={s.contactName || s.name} phone={s.phone} email={s.email} iconOnly />
                  {map ? (
                    <a href={map} target="_blank" rel="noreferrer" title="Ver en Google Maps" aria-label="Ver en Google Maps" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#dc2626]/40 bg-[#dc2626]/10 text-[#b91c1c] transition hover:bg-[#dc2626]/20">{PinIcon}</a>
                  ) : (
                    <span title="Falta la dirección: cargala con Editar" className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-line bg-bg text-muted/70">{PinIcon}</span>
                  )}
                  <CreateDrawer compact iconOnly icon={PencilIcon} buttonLabel="Editar" title={`Editar: ${s.name}`} variant="secondary" action={updateSupplier.bind(null, s.id)} fields={fields(s)} />
                  <ConfirmActionButton action={deleteSupplier.bind(null, s.id)} label="Eliminar proveedor" message={`¿Eliminar a "${s.name}"? Sus compras se conservan, pero quedan sin proveedor.`} icon medium />
                </div>
              );
            },
          },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}
