import Link from "next/link";
import { ContactButtons } from "@/components/shared/ContactButtons";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { IconPencil, IconTrash } from "@/components/shared/icons";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { NameCardButton } from "@/components/shared/NameCardButton";
import { InfoCardButton } from "@/components/shared/InfoCardButton";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/primitives";
import { fdate, int, money } from "@/lib/format";
import { quickFor } from "@/modules/quick-replies";
import { replyToBuyer } from "@/integrations/mercadolibre/actions";
import { mlMessagesFor } from "@/integrations/mercadolibre/data";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import { createCustomer, saveCustomerData, unmarkCustomerFull } from "@/modules/actions";
import { saleTotals } from "@/modules/calc";
import { looksLikeUser, mlUserOf } from "@/modules/customers";
import { getDb } from "@/modules/data";
import type { Customer } from "@/modules/types";

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const sp = (await searchParams) as SearchParams;
  const db = await getDb();
  const tab = param(sp, "tab") === "todos" ? "todos" : "completos";
  const q = param(sp, "q"), origin = param(sp, "origin"), orden = param(sp, "orden"), datos = param(sp, "datos");
  const stats = (id: string) => {
    const sales = db.sales.filter((s) => s.customerId === id && s.status !== "cancelada");
    const revenue = sales.reduce((t, s) => t + saleTotals(db, s).revenue, 0);
    return { count: sales.length, revenue, ticket: sales.length ? revenue / sales.length : 0, last: sales.map((s) => s.date).sort().at(-1) };
  };
  // Agenda: sin repetir. Si dos contactos tienen el mismo teléfono, queda el que compró más recientemente.
  const phoneKey = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10);
  const seenPhones = new Set<string>();
  const completos = db.customers.filter((c) => c.full)
    .sort((a, b) => (stats(b.id).last ?? "").localeCompare(stats(a.id).last ?? ""))
    .filter((c) => { const k = phoneKey(c.phone); if (seenPhones.has(k)) return false; seenPhones.add(k); return true; });
  const base = tab === "completos" ? completos : db.customers;
  const tiene: Record<string, (c: Customer) => boolean> = { telefono: (c) => !!c.phone, "sin-telefono": (c) => !c.phone, domicilio: (c) => !!c.address, "sin-domicilio": (c) => !c.address };
  const filtered = base.filter((c) => matches(q, c.name, c.nickname, c.company, c.email, c.phone, c.city, c.doc) && (!origin || c.origin === origin) && (!datos || tiene[datos]?.(c) !== false));
  // Orden: por defecto, los que compraron más recientemente primero (los que nunca compraron, al final).
  const key = (c: Customer) => stats(c.id);
  const byName = (a: Customer, b: Customer) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const sorters: Record<string, (a: Customer, b: Customer) => number> = {
    reciente: (a, b) => (key(b).last ?? "").localeCompare(key(a).last ?? "") || byName(a, b),
    antigua: (a, b) => (key(a).last ?? "9999").localeCompare(key(b).last ?? "9999") || byName(a, b),
    az: byName, za: (a, b) => byName(b, a),
    compras: (a, b) => key(b).count - key(a).count || byName(a, b),
    factura: (a, b) => key(b).revenue - key(a).revenue || byName(a, b),
    nuevo: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || byName(a, b),
  };
  filtered.sort(sorters[orden] ?? sorters.reciente);
  const { rows, page, pages, total } = paginate(filtered, sp, 25);

  // Mensajería directa de Mercado Libre: la última compra de cada contacto de la página y su conversación.
  const lastMlOrder = (c: Customer) => [...db.sales].filter((x) => x.customerId === c.id && x.status !== "cancelada" && x.mlOrderId).sort((a, b) => b.date.localeCompare(a.date))[0]?.mlOrderId;
  const msgsByOrder = new Map<string, { id: string; text: string; date: string; fromBuyer: boolean }[]>();
  if (isSupabase()) {
    const ids = [...new Set(rows.map(lastMlOrder).filter(Boolean) as string[])];
    const all = ids.length ? await mlMessagesFor(await activeProjectId(), ids).catch(() => []) : [];
    for (const m of all) if (m.orderId) msgsByOrder.set(m.orderId, [...(msgsByOrder.get(m.orderId) ?? []), m]);
  }
  const chatIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3A1.5 1.5 0 0 1 3 11.5v-7Z" /></svg>;
  const mlMessageButton = (c: Customer) => {
    const orderId = c.id.startsWith("mlb_") ? lastMlOrder(c) : undefined;
    if (!orderId) {
      return <span title={c.origin === "Tienda Nube" ? "La mensajería de Tienda Nube todavía no está disponible" : "Este contacto no tiene mensajería de Mercado Libre"} aria-label="Mensaje (no disponible)" className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-line bg-bg text-muted/40">{chatIcon}</span>;
    }
    const conv = [...(msgsByOrder.get(orderId) ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <CreateDrawer buttonLabel="Mensaje por Mercado Libre" iconOnly icon={chatIcon} compact variant="secondary" title={`Mensaje a ${c.name} · Mercado Libre`} action={replyToBuyer.bind(null, orderId, c.id.replace(/^mlb_/, ""))}
        className="border-[#e6cf00]! bg-[#ffe600]! text-[#2d3277]! hover:bg-[#f5d800]!"
        fields={[
          ...(conv.length ? [{ name: "conversacion", label: "Conversación hasta ahora", type: "textarea" as const, readOnly: true, rows: 9, defaultValue: conv.map((m) => `${m.fromBuyer ? c.name : "Vos"} · ${new Date(m.date).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}\n${m.text || "(vacío o adjunto)"}`).join("\n\n") }] : []),
          { name: "text", label: "Tu mensaje (máximo 350 por mensaje; para mandar varios, separalos con una línea ---)", type: "textarea" as const, required: true, maxLength: 800, placeholder: "Escribí tu mensaje al comprador…", quick: quickFor(db.settings.company, db.settings.name, { nombre: looksLikeUser(c) ? "" : c.name, productos: (() => { const sl = [...db.sales].filter((x) => x.customerId === c.id && x.status !== "cancelada").sort((a, b) => b.date.localeCompare(a.date))[0]; return sl ? sl.items.map((i) => db.products.find((p) => p.id === i.productId)?.name ?? "").filter(Boolean).join(", ") : ""; })() }) },
        ]} />
    );
  };

  const dataFields = (c?: Customer) => [
    // El usuario de Mercado Libre queda siempre a la vista y no se puede cambiar; el campo de abajo es solo para el nombre real.
    ...(mlUserOf(c) ? [{ name: "mlUser", label: "Usuario de Mercado Libre", defaultValue: mlUserOf(c), readOnly: true, help: "Queda siempre guardado: no se modifica." }] : []),
    { name: "name", label: "Nombre y apellido reales", defaultValue: c && !looksLikeUser(c) ? c.name : "", placeholder: "Escribí el nombre real" },
    { name: "phone", label: "Teléfono", defaultValue: c?.phone },
    { name: "email", label: "Email", type: "email" as const, defaultValue: c?.email },
    { name: "address", label: "Domicilio", defaultValue: c?.address },
    { name: "city", label: "Ciudad y provincia", defaultValue: c?.city },
    { name: "doc", label: "DNI / CUIT", defaultValue: c?.doc },
    { name: "company", label: "Empresa (opcional)", defaultValue: c?.company },
    { name: "notes", label: "Notas", type: "textarea" as const, defaultValue: c?.notes },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes" subtitle="La Agenda se arma sola: entran los contactos que tienen teléfono"
        actions={
          <CreateDrawer
            buttonLabel="Nuevo cliente" title="Nuevo cliente" action={createCustomer}
            fields={[
              ...dataFields().filter((f) => f.name !== "company").map((f) => (f.name === "name" ? { ...f, required: true } : f)), { name: "company", label: "Empresa (opcional)" },
              { name: "origin", label: "Origen", type: "select", options: db.settings.channels.map((c) => ({ value: c, label: c })) },
            ]}
          />
        }
      />
      <nav className="flex flex-wrap gap-1.5" aria-label="Clientes">
        {([["completos", `Agenda (${completos.length})`], ["todos", `Todos (${db.customers.length})`]] as const).map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      {tab === "completos" && completos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-medium">Tu agenda todavía está vacía</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted">La Agenda se arma sola: un contacto entra apenas tiene <strong>teléfono</strong>. Cargalo con <strong>Editar</strong> en la solapa <strong>Todos</strong>; el resto de los datos los pedís y completás después.</p>
        </div>
      ) : (
        <>
          <Filters sp={sp} searchPlaceholder="Buscar por nombre, apodo, teléfono, email, ciudad o documento" filters={[
            { name: "orden", label: "Ordenar", allLabel: "Más recientes", options: [
              { value: "antigua", label: "Más antiguas" }, { value: "az", label: "Nombre A a Z" }, { value: "za", label: "Nombre Z a A" },
              { value: "compras", label: "Más compras" }, { value: "factura", label: "Mayor facturación" }, { value: "nuevo", label: "Agregados recientemente" },
            ] },
            { name: "datos", label: "Datos", options: [{ value: "telefono", label: "Con teléfono" }, { value: "sin-telefono", label: "Sin teléfono" }, { value: "domicilio", label: "Con domicilio" }, { value: "sin-domicilio", label: "Sin domicilio" }] },
            { name: "origin", label: "Origen", options: db.settings.channels },
          ]} />
          <DataTable
            rows={rows} rowKey={(c) => c.id} emptyTitle="Sin resultados" compact
            columns={[
              {
                key: "n", header: "Cliente", render: (c) => (
                  <div className="min-w-28">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <NameCardButton name={c.name} title={c.name}>
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{c.origin}</Badge>
                            {c.nickname && <span className="text-xs text-muted">Usuario ML: {c.nickname}</span>}
                            {c.full ? <Badge tone="success">En Agenda</Badge> : <Badge tone="warning">Sin teléfono: no está en la Agenda</Badge>}
                          </div>
                          <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2">
                            {([["Nombre", c.name], ["Teléfono", c.phone], ["Email", c.email], ["Domicilio", c.address], ["Ciudad", c.city], ["DNI / CUIT", c.doc], ["Empresa", c.company]] as [string, string | undefined][]).map(([k, v]) => (
                              <div key={k} className="contents"><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="min-h-9 break-words rounded-md border border-line bg-bg px-2.5 py-2 text-sm">{v || ""}</dd></div>
                            ))}
                          </dl>
                          <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-bg p-2.5 text-center">
                            <div><p className="text-[11px] uppercase tracking-wide text-muted">Compras</p><p className="font-semibold">{int(stats(c.id).count)}</p></div>
                            <div><p className="text-[11px] uppercase tracking-wide text-muted">Facturación</p><p className="font-semibold">{money(stats(c.id).revenue)}</p></div>
                            <div><p className="text-[11px] uppercase tracking-wide text-muted">Última</p><p className="font-semibold">{stats(c.id).last ? fdate(stats(c.id).last!) : "—"}</p></div>
                          </div>
                          {c.notes && <p className="whitespace-pre-wrap rounded-md border border-line p-2.5 text-xs text-muted">{c.notes}</p>}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                            <ContactButtons name={c.name} phone={c.phone} email={c.email} iconOnly />
                            <CreateDrawer buttonLabel="Editar" variant="secondary" title={c.full ? `Editar: ${c.name}` : `Completar los datos de ${c.name}`} action={saveCustomerData.bind(null, c.id)} fields={dataFields(c)} />
                          </div>
                        </div>
                      </NameCardButton>
                    </div>
                    <p className="text-[11px] text-muted">{c.nickname ? `Usuario ML: ${c.nickname}` : c.company || "—"}</p>
                  </div>
                ),
              },
              { key: "c", header: "Contacto", render: (c) => <div><p className="whitespace-nowrap">{c.phone || "—"}</p><p className="text-[11px] text-muted">{c.email}</p></div> },
              { key: "ci", header: "Ciudad", render: (c) => <span className="block max-w-32">{c.city || "—"}</span> },
              { key: "o", header: "Origen", render: (c) => <span className="whitespace-nowrap">{c.origin}</span> },
              { key: "cn", header: "Compras", align: "center" as const, render: (c) => int(stats(c.id).count) },
              { key: "f", header: "Facturación", align: "center" as const, render: (c) => money(stats(c.id).revenue) },
              { key: "t", header: "Ticket prom.", align: "center" as const, render: (c) => money(stats(c.id).ticket) },
              { key: "l", header: "Última compra", render: (c) => { const l = stats(c.id).last; return l ? fdate(l) : "—"; } },
              {
                key: "a", header: "", render: (c) => (
                  <div className="flex items-center justify-end gap-1">
                    <InfoCardButton title={c.name} label="Ver datos del cliente" medium>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{c.origin}</Badge>
                          {c.nickname && <span className="text-xs text-muted">Usuario ML: {c.nickname}</span>}
                        </div>
                        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                          {([["Teléfono", c.phone], ["Email", c.email], ["Domicilio", c.address], ["Ciudad", c.city], ["DNI / CUIT", c.doc], ["Empresa", c.company]] as [string, string][]).map(([k, v]) => (
                            <div key={k} className="contents"><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="break-words">{v || "—"}</dd></div>
                          ))}
                        </dl>
                        <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-bg p-2.5 text-center">
                          <div><p className="text-[11px] uppercase tracking-wide text-muted">Compras</p><p className="font-semibold">{int(stats(c.id).count)}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-muted">Facturación</p><p className="font-semibold">{money(stats(c.id).revenue)}</p></div>
                          <div><p className="text-[11px] uppercase tracking-wide text-muted">Última</p><p className="font-semibold">{stats(c.id).last ? fdate(stats(c.id).last!) : "—"}</p></div>
                        </div>
                        {c.notes && <p className="whitespace-pre-wrap rounded-md border border-line p-2.5 text-xs text-muted">{c.notes}</p>}
                        <div className="flex items-center gap-1">
                          <ContactButtons name={c.name} phone={c.phone} email={c.email} iconOnly />
                          <CreateDrawer buttonLabel="Editar" iconOnly icon={<IconPencil />} variant="secondary" compact title={c.full ? `Editar: ${c.name}` : `Completar los datos de ${c.name}`} action={saveCustomerData.bind(null, c.id)} fields={dataFields(c)} />
                        </div>
                      </div>
                    </InfoCardButton>
                    <ContactButtons name={c.name} phone={c.phone} email={c.email} iconOnly />
                    {mlMessageButton(c)}
                    {c.full ? (
                      <ConfirmActionButton action={unmarkCustomerFull.bind(null, c.id)} label="Sacar de la Agenda" message={`¿Sacar a "${c.name}" de la Agenda? No se borra: sigue en la solapa Todos con sus datos y sus compras.`} icon medium />
                    ) : (
                      <span title="Solo los contactos de la Agenda se pueden sacar de ella" aria-label="Sacar de la Agenda (no disponible)" className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-line bg-bg text-muted/40"><IconTrash /></span>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <Pager sp={sp} page={page} pages={pages} total={total} />
        </>
      )}
    </div>
  );
}
