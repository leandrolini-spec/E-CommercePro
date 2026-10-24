import { headers } from "next/headers";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { IconCheck, IconMail, IconPencil, IconPrint, IconSend, IconWhatsApp, IconX } from "@/components/shared/icons";
import { InfoCardButton } from "@/components/shared/InfoCardButton";
import { QuoteEditor } from "@/components/shared/QuoteEditor";
import { ActionButton, Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, type Tone } from "@/components/ui/primitives";
import { fdate, money } from "@/lib/format";
import { deleteQuote, setQuoteStatus } from "@/modules/actions";
import { quoteStatus, quoteTotals } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { gmailLink, waLink } from "@/lib/contact";
import { Guide } from "@/components/ui/Guide";

const TONE: Record<string, Tone> = { borrador: "neutral", enviado: "info", aceptado: "success", rechazado: "danger", vencido: "warning" };

export default async function PresupuestosPage({ searchParams }: PageProps<"/presupuestos">) {
  const sp = (await searchParams) as SearchParams;
  const db = (await getDb());
  const q = param(sp, "q"), status = param(sp, "status"), from = param(sp, "from"), to = param(sp, "to");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "tu-crm.vercel.app";
  const base = (process.env.APP_BASE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${host}`).replace(/\/$/, "");
  const cust = (x: { customerId: string; customerName?: string }) => x.customerName || db.customers.find((c) => c.id === x.customerId)?.name || "—";
  const productsList = db.products.filter((p) => (p.kind ?? "venta") !== "consumible").map((p) => ({ id: p.id, name: p.name, price: p.price }));
  const customersList = db.customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
  const filtered = [...db.quotes]
    .sort((a, b) => b.number - a.number)
    .filter((x) => matches(q, cust(x), x.number) && (!status || quoteStatus(x) === status) && (!from || x.date >= from) && (!to || x.date <= to));
  const { rows, page, pages, total } = paginate(filtered, sp);

  return (
    <div>
      <PageHeader
        title="Presupuestos" subtitle="Subtotal, descuento, impuestos y total. Los enviados con validez vencida figuran como vencidos."
        actions={<QuoteEditor products={productsList} customers={customersList} defaultTaxPct={db.settings.taxPct} />}
      />
      <Filters sp={sp} dates searchPlaceholder="Buscar por cliente o número" filters={[{ name: "status", label: "Estado", options: ["borrador", "enviado", "aceptado", "rechazado", "vencido"] }]} />
      <DataTable
        compact rows={rows} rowKey={(x) => x.id}
        columns={[
          { key: "n", header: "N.º", render: (x) => <div className="whitespace-nowrap"><p className="text-sm font-medium">{`P-${String(x.number).padStart(4, "0")}`}</p><p className="text-[11px] text-muted">{fdate(x.date)}</p></div> },
          { key: "c", header: "Cliente", render: (x) => <div className="min-w-32"><p className="text-sm font-medium">{cust(x)}</p><p className="text-[11px] text-muted">{x.items.length} producto{x.items.length === 1 ? "" : "s"}</p></div> },
          { key: "t", header: "Total", align: "right", render: (x) => <div className="whitespace-nowrap"><p className="text-sm font-semibold">{money(quoteTotals(x).total)}</p><p className="text-[11px] text-muted">Subtotal {money(quoteTotals(x).subtotal)}</p></div> },
          { key: "st", header: "Estado", render: (x) => <div><Badge fixed tone={TONE[quoteStatus(x)]}>{quoteStatus(x)}</Badge><p className="mt-0.5 whitespace-nowrap text-[11px] text-muted">hasta {fdate(x.validUntil)}</p></div> },
          {
            key: "a", header: "",
            render: (x) => {
              const t = quoteTotals(x);
              const total = money(t.total);
              const link = x.shareToken ? `${base}/p/${x.shareToken}` : "";
              const first = cust(x).split(" ")[0];
              const num = `P-${String(x.number).padStart(4, "0")}`;
              const phone = x.customerPhone || db.customers.find((c) => c.id === x.customerId)?.phone || "";
              const email = x.customerEmail || db.customers.find((c) => c.id === x.customerId)?.email || "";
              const text = `Hola ${first}! Te paso el presupuesto ${num} por ${total}, válido hasta el ${fdate(x.validUntil)}. Podés verlo y descargarlo acá: ${link}`;
              const wa = phone && link ? waLink(phone, text) : null;
              const mail = email && /.+@.+\..+/.test(email) && link ? gmailLink(email, `Presupuesto ${num}`, `Hola ${first},\n\nTe paso el presupuesto ${num} por ${total}, válido hasta el ${fdate(x.validUntil)}.\nPodés verlo y descargarlo acá: ${link}\n\nSaludos`) : null;
              const sq = "inline-flex h-8 w-8 items-center justify-center rounded-md border transition";
              const off = `${sq} cursor-not-allowed border-line bg-bg text-muted/60`;
              const state = quoteStatus(x);
              return (
                <div className="flex items-center justify-end gap-1">
                  <InfoCardButton title={`Presupuesto ${num}`} label="Ver el detalle del presupuesto" medium>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[state]}>{state}</Badge><span className="text-xs text-muted">{cust(x)} · {fdate(x.date)} · válido hasta {fdate(x.validUntil)}</span></div>
                      <ul className="divide-y divide-line rounded-md border border-line">
                        {x.items.map((i, k) => (
                          <li key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0"><span className="font-medium">{i.description || db.products.find((p) => p.id === i.productId)?.name || "Producto"}</span><span className="block text-xs text-muted">{i.qty} × {money(i.unitPrice)}</span></span>
                            <span className="shrink-0 tabular-nums">{money(i.qty * i.unitPrice)}</span>
                          </li>
                        ))}
                      </ul>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{money(t.subtotal)}</dd></div>
                        {t.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Descuento ({x.discountPct} %)</dt><dd className="tabular-nums">− {money(t.discount)}</dd></div>}
                        {t.tax > 0 && <div className="flex justify-between"><dt className="text-muted">Impuestos ({x.taxPct} %)</dt><dd className="tabular-nums">{money(t.tax)}</dd></div>}
                        <div className="flex justify-between"><dt className="text-muted">Logística</dt><dd className="tabular-nums">{t.shipping > 0 ? money(t.shipping) : "—"}</dd></div>
                        <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{total}</dd></div>
                      </dl>
                      {x.notes && <p className="whitespace-pre-wrap rounded-md border border-line p-2.5 text-xs text-muted">{x.notes}</p>}
                      {(phone || email) && <p className="text-xs text-muted">Contacto: {[phone, email].filter(Boolean).join(" · ")}</p>}
                    </div>
                  </InfoCardButton>
                  <a href={`/presupuesto/${x.id}`} target="_blank" rel="noreferrer" title="Imprimir o guardar como PDF" aria-label="Imprimir o guardar como PDF" className={`${sq} border-primary bg-primary text-white hover:bg-primary-hover`}><IconPrint /></a>
                  {wa ? <a href={wa} target="_blank" rel="noreferrer" title={`Enviar por WhatsApp a ${phone}`} aria-label="Enviar por WhatsApp" className={`${sq} border-[#16a34a]/40 bg-[#16a34a]/10 text-[#15803d] hover:bg-[#16a34a]/20`}><IconWhatsApp /></a> : <span title="Falta el teléfono: cargalo con Editar" className={off}><IconWhatsApp /></span>}
                  {mail ? <a href={mail} target="_blank" rel="noreferrer" title={`Enviar por correo a ${email}`} aria-label="Enviar por correo" className={`${sq} border-[#2563eb]/40 bg-[#2563eb]/10 text-[#1d4ed8] hover:bg-[#2563eb]/20`}><IconMail /></a> : <span title="Falta el correo: cargalo con Editar" className={off}><IconMail /></span>}
                  <QuoteEditor
                    label="Editar" variant="secondary" iconOnly icon={<IconPencil />} products={productsList} customers={customersList} defaultTaxPct={db.settings.taxPct}
                    initial={{ id: x.id, customerId: x.customerId, customerName: cust(x) === "—" ? "" : cust(x), customerPhone: x.customerPhone ?? "", customerEmail: x.customerEmail ?? "", discountPct: x.discountPct, taxPct: x.taxPct, shipping: x.shipping ?? 0, notes: x.notes ?? "", validDays: Math.max(1, Math.round((new Date(x.validUntil).getTime() - new Date(x.date).getTime()) / 86400000)), items: x.items }}
                  />
                  {x.status === "borrador" && <ActionButton action={setQuoteStatus.bind(null, x.id, "enviado")} label="Marcar como enviado" iconOnly small icon={<IconSend />} />}
                  {state === "enviado" && (
                    <>
                      <ActionButton action={setQuoteStatus.bind(null, x.id, "aceptado")} label="Marcar como aceptado" iconOnly small icon={<IconCheck />} />
                      <ActionButton action={setQuoteStatus.bind(null, x.id, "rechazado")} label="Marcar como rechazado" iconOnly small icon={<IconX />} />
                    </>
                  )}
                  <ConfirmActionButton action={deleteQuote.bind(null, x.id)} label="Eliminar presupuesto" message={`¿Eliminar el presupuesto ${num}? Esta acción no se puede deshacer.`} icon medium />
                </div>
              );
            },
          },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
      <Guide className="mt-3" title="¿Qué significa cada ícono?">Los íconos de cada fila: ojo (detalle), impresora (PDF, no es una factura), WhatsApp y correo (enviar), lápiz (editar), avión (marcar enviado), tilde y cruz (aceptado o rechazado) y tacho (eliminar). Pasá el mouse para ver el nombre de cada uno.</Guide>
    </div>
  );
}
