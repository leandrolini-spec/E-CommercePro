"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Drawer } from "@/components/ui/overlays";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { saveQuote, type QuotePayload } from "@/modules/actions";

type Product = { id: string; name: string; price: number };
type Customer = { id: string; name: string; phone?: string; email?: string };
type Line = { productId: string; description: string; qty: string; unitPrice: string };
export type QuoteInit = { id: string; customerId: string; customerName: string; customerPhone: string; customerEmail: string; discountPct: number; taxPct: number; shipping: number; validDays: number; notes: string; items: { productId: string; qty: number; unitPrice: number; description?: string }[] };

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2, maximumFractionDigits: 2 }).format(n);
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const FREE = "__libre";

/** Editor de presupuestos: varias líneas, descuento, impuestos y logística, con el total calculado en vivo. */
export function QuoteEditor({ products, customers, defaultTaxPct, initial, label = "Nuevo presupuesto", variant = "primary", icon, iconOnly = false }: {
  products: Product[]; customers: Customer[]; defaultTaxPct: number; initial?: QuoteInit; label?: string; variant?: "primary" | "secondary"; icon?: ReactNode; iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blank = (): Line => ({ productId: "", description: "", qty: "1", unitPrice: "" });
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState(initial?.customerEmail ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial?.items.length ? initial.items.map((i) => ({ productId: i.productId || FREE, description: i.description ?? "", qty: String(i.qty), unitPrice: String(i.unitPrice) })) : [blank()],
  );
  const [discount, setDiscount] = useState(String(initial?.discountPct ?? 0));
  const [tax, setTax] = useState(String(initial?.taxPct ?? defaultTaxPct));
  const [shipping, setShipping] = useState(initial?.shipping ? String(initial.shipping) : "");
  const [validDays, setValidDays] = useState(String(initial?.validDays ?? 15));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
  const discountAmt = subtotal * (num(discount) / 100);
  const taxAmt = (subtotal - discountAmt) * (num(tax) / 100);
  const ship = num(shipping);
  const total = subtotal - discountAmt + taxAmt + ship;

  function setLine(i: number, patch: Partial<Line>) { setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); }
  function pickProduct(i: number, id: string) {
    const p = products.find((x) => x.id === id);
    setLine(i, { productId: id, unitPrice: p ? String(p.price) : lines[i].unitPrice, description: id === FREE ? lines[i].description : "" });
  }
  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setCustomerName(c.name); setCustomerPhone(c.phone ?? ""); setCustomerEmail(c.email ?? ""); }
  }
  function submit() {
    setError(null);
    const payload: QuotePayload = {
      customerId, customerName, customerPhone, customerEmail, discountPct: num(discount), taxPct: num(tax), shipping: ship, validDays: num(validDays) || 15, notes,
      items: lines.map((l) => ({ productId: l.productId === FREE ? "" : l.productId, description: l.productId === FREE ? l.description : "", qty: num(l.qty), unitPrice: num(l.unitPrice) })),
    };
    start(async () => {
      try {
        await saveQuote(initial?.id ?? null, payload);
        setOpen(false);
        if (!initial) { setLines([blank()]); setCustomerId(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setNotes(""); setShipping(""); }
      } catch (e) { setError((e as Error).message || "No se pudo guardar."); }
    });
  }

  return (
    <>
      <Button variant={variant} title={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} className={iconOnly ? "h-8 w-8 justify-center px-0 py-0" : initial ? "h-8 px-2.5 py-0 text-xs" : ""} onClick={() => { setError(null); setOpen(true); }}>{icon}{iconOnly ? null : label}</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={initial ? "Editar presupuesto" : "Nuevo presupuesto"}>
        <div className="space-y-4">
          <Field label="Cliente">
            <Select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">Otro cliente (escribir el nombre abajo)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Nombre que se imprime en el presupuesto *">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ej: Claudia Carballo" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WhatsApp / teléfono"><Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="11 5555 5555" inputMode="tel" /></Field>
            <Field label="Correo electrónico"><Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="cliente@mail.com" /></Field>
          </div>
          <p className="-mt-2 text-xs text-muted">Con estos datos, después de guardar podés enviarle el presupuesto por WhatsApp o por correo desde la lista.</p>

          <div>
            <p className="mb-1.5 text-sm font-medium">Productos</p>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border border-line bg-bg p-2.5">
                  <Select value={l.productId} onChange={(e) => pickProduct(i, e.target.value)} aria-label="Producto">
                    <option value="">Elegir producto…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
                    <option value={FREE}>Otro (escribir descripción)</option>
                  </Select>
                  {l.productId === FREE && <Input className="mt-2" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Descripción del producto o servicio" />}
                  <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-end gap-2">
                    <label className="text-xs text-muted">Cant.<Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></label>
                    <label className="text-xs text-muted">Precio unitario<Input type="number" min="0" step="any" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></label>
                    <div className="pb-1 text-right">
                      <p className="text-xs text-muted">Subtotal</p>
                      <p className="text-sm font-semibold tabular-nums">{money(num(l.qty) * num(l.unitPrice))}</p>
                    </div>
                  </div>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="mt-1.5 text-xs text-danger hover:underline">Quitar este producto</button>}
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-2 h-8 px-3 py-0 text-xs" onClick={() => setLines((ls) => [...ls, blank()])}>+ Agregar otro producto</Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Descuento %"><Input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            <Field label="Impuestos %"><Input type="number" min="0" step="any" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
            <Field label="Logística (envío) $"><Input type="number" min="0" step="any" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0 si no hace falta" /></Field>
            <Field label="Validez (días)"><Input type="number" min="1" value={validDays} onChange={(e) => setValidDays(e.target.value)} /></Field>
          </div>
          <Field label="Notas o condiciones (se imprimen al pie)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ej: Entrega a coordinar. Forma de pago: transferencia." className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </Field>

          <div className="rounded-lg border border-line bg-surface p-3 text-sm">
            <Row label="Subtotal" value={money(subtotal)} />
            {discountAmt > 0 && <Row label={`Descuento (${num(discount)} %)`} value={`− ${money(discountAmt)}`} />}
            {taxAmt > 0 && <Row label={`Impuestos (${num(tax)} %)`} value={money(taxAmt)} />}
            <Row label="Logística" value={ship > 0 ? money(ship) : "$ 0"} />
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums text-success">{money(total)}</span></div>
          </div>

          {error && <Alert tone="danger" title={error} />}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={pending} onClick={submit}>{pending ? "Guardando…" : "Guardar presupuesto"}</Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-0.5"><span className="text-muted">{label}</span><span className="tabular-nums">{value}</span></div>;
}
