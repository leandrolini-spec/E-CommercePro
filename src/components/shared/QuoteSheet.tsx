/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { fdate, money } from "@/lib/format";
import { SENDER_EMAIL } from "@/lib/contact";
import { brandColor, brandSoft, softBorder, softTint } from "@/lib/brand";
import { brandFonts, fontBold, fontsHref } from "@/lib/fonts";
import { quoteTotals } from "@/modules/calc";
import type { Db, Quote } from "@/modules/types";

/** Hoja del presupuesto (A4): se usa para imprimir desde el CRM y para el link que recibe el cliente. No es una factura. */
export function QuoteSheet({ db, q, top }: { db: Db; q: Quote; top?: ReactNode }) {
  const t = quoteTotals(q);
  const customer = db.customers.find((c) => c.id === q.customerId);
  const name = q.customerName || customer?.name || "";
  const lines = q.items.map((i) => {
    const p = db.products.find((x) => x.id === i.productId);
    return { desc: i.description || p?.name || "Producto", qty: i.qty, unit: i.unitPrice, sub: i.qty * i.unitPrice };
  });
  const number = `P-${String(q.number).padStart(4, "0")}`;
  const brand = db.settings.brand ?? {}, company = db.settings.company ?? {};
  const accent = brandColor(brand), soft = brandSoft(brand), line = softBorder(soft);
  const f = brandFonts(brand);
  const fam = (n: string) => `"${n}", system-ui, sans-serif`;
  const contactLine = [[company.address, company.city, company.province].filter(Boolean).join(", "), company.phone || company.whatsapp, company.website].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-3xl rounded-lg px-8 py-8 print:max-w-none print:rounded-none print:p-0" style={{ fontFamily: fam(f.text), background: soft, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <link rel="stylesheet" href={fontsHref([f.title, f.subtitle, f.text])} precedence="default" />
      <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: ${soft} !important; } }`}</style>
      {top}

      <header className="flex items-start justify-between border-b-2 pb-4" style={{ borderColor: accent }}>
        <div>
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={db.settings.name} className="mb-2 max-h-9 w-auto max-w-[11rem] object-contain" />
          ) : (
            <>
              <h1 className="text-3xl tracking-tight" style={{ color: accent, fontFamily: fam(f.title), fontWeight: fontBold(f.title) }}>{db.settings.name}</h1>
              {brand.tagline && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600" style={{ fontFamily: fam(f.subtitle) }}>{brand.tagline}</p>}
            </>
          )}
          {company.legalName && <p className="text-sm text-gray-600">{company.legalName}{company.cuit ? ` · CUIT ${company.cuit}` : ""}</p>}
          {!company.legalName && company.cuit && <p className="text-sm text-gray-600">CUIT {company.cuit}</p>}
          {contactLine && <p className="text-sm text-gray-600">{contactLine}</p>}
          <p className="text-sm text-gray-600">{company.email || SENDER_EMAIL}</p>
        </div>
        <div className="text-right">
          <p className="text-base uppercase tracking-wide" style={{ fontFamily: fam(f.title), fontWeight: fontBold(f.title) }}>Presupuesto</p>
          <p className="text-sm font-semibold">N.º {number}</p>
          <p className="text-sm text-gray-600">Fecha: {fdate(q.date)}</p>
          <p className="text-sm text-gray-600">Válido hasta: {fdate(q.validUntil)}</p>
        </div>
      </header>

      <section className="my-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Presupuesto para</p>
        <p className="text-xl font-semibold">{name}</p>
        {customer && (
          <p className="text-sm text-gray-600">
            {[customer.phone, customer.email, [customer.address, customer.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-600" style={{ background: softTint(soft) }}>
            <th className="px-3 py-2">Descripción</th>
            <th className="px-3 py-2 text-right">Cant.</th>
            <th className="px-3 py-2 text-right">Precio unitario</th>
            <th className="px-3 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b" style={{ borderColor: line }}>
              <td className="px-3 py-2.5">{l.desc}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{l.qty}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(l.unit)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(l.sub)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto mt-4 w-full max-w-xs text-sm">
        <Row label="Subtotal" value={money(t.subtotal)} />
        {t.discount > 0 && <Row label={`Descuento (${q.discountPct} %)`} value={`− ${money(t.discount)}`} />}
        {t.tax > 0 && <Row label={`Impuestos (${q.taxPct} %)`} value={money(t.tax)} />}
        <Row label="Logística" value={t.shipping > 0 ? money(t.shipping) : "$ 0"} />
        <div className="mt-2 flex items-center justify-between border-t-2 pt-2 text-lg font-bold" style={{ borderColor: accent }}>
          <span>TOTAL</span><span className="tabular-nums">{money(t.total)}</span>
        </div>
      </section>

      {q.notes && (
        <section className="mt-8 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notas y condiciones</p>
          <p className="whitespace-pre-wrap">{q.notes}</p>
        </section>
      )}

      <footer className="mt-10 border-t pt-3 text-center text-xs text-gray-500" style={{ borderColor: line }}>
        {brand.quoteFooter || `Presupuesto válido hasta el ${fdate(q.validUntil)}. Los precios pueden variar pasada esa fecha. Este documento es un presupuesto y no tiene validez como factura.`}
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-0.5"><span className="text-gray-600">{label}</span><span className="tabular-nums">{value}</span></div>;
}
