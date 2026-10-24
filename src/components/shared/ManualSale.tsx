"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Drawer } from "@/components/ui/overlays";
import { Alert, Button, CurrencyInput, DatePicker, Field, Input, Select } from "@/components/ui/primitives";
import { CARRIERS } from "@/modules/carriers";
import { createManualSale } from "@/modules/actions";

type Line = { key: number; productId: string; qty: string; unitPrice: string; discountPct: string };
type Props = {
  channels: string[]; payMethods: string[];
  products: { id: string; name: string; price: number }[];
  customers: { id: string; name: string; phone: string; doc: string; address: string; city: string }[];
};

const today = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local
const ars = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const Section = ({ children }: { children: ReactNode }) => <h3 className="col-span-2 -mb-1 mt-2 border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h3>;

/** Botón + formulario para cargar a mano una venta (Instagram, WhatsApp, Meta…): se contabiliza y entra sola a Envíos. */
export function ManualSale({ channels, payMethods, products, customers }: Props) {
  const firstChannel = channels.includes("WhatsApp") ? "WhatsApp" : channels.find((c) => c !== "Mercado Libre" && c !== "Tienda Nube") ?? channels[0] ?? "";
  const blank = () => ({
    channel: firstChannel, date: today(), customerId: "", name: "", phone: "", dni: "", address: "", city: "", zip: "", handle: "",
    carrier: "logistica", eta: "", extraCosts: "", payMethod: payMethods[0] ?? "", notes: "",
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: "1", unitPrice: "", discountPct: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof ReturnType<typeof blank>, v: string) => setF((x) => ({ ...x, [k]: v }));

  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setF((x) => ({ ...x, customerId: id, ...(c ? { name: c.name, phone: c.phone, dni: c.doc, address: c.address, city: c.city } : {}) }));
  };
  const setLine = (key: number, patch: Partial<Line>) => setLines((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const pickProduct = (key: number, productId: string) => setLine(key, { productId, unitPrice: String(products.find((p) => p.id === productId)?.price ?? "") });
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discountPct) || 0) / 100), 0);

  function openForm() {
    setF(blank()); setLines([{ key: Date.now(), productId: "", qty: "1", unitPrice: "", discountPct: "" }]); setError(null); setOpen(true);
  }
  function save() {
    setError(null);
    start(async () => {
      try {
        const r = await createManualSale({
          channel: f.channel, date: f.date, customerId: f.customerId, name: f.name, phone: f.phone, dni: f.dni, address: f.address, city: f.city, zip: f.zip, handle: f.handle,
          items: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, discountPct: Number(l.discountPct) || 0 })),
          carrier: f.carrier, eta: f.eta, extraCosts: Number(f.extraCosts) || 0, payMethod: f.payMethod, notes: f.notes,
        });
        if (r && "error" in r) { setError(r.error); return; }
        setOpen(false);
      } catch (e) {
        const m = (e as Error).message || "";
        setError(!m || /#441|Server Components render/.test(m) ? "No se pudo guardar. Revisá los datos e intentá de nuevo." : m);
      }
    });
  }

  return (
    <>
      <Button onClick={openForm}>Cargar venta</Button>
      <Drawer
        open={open} onClose={() => setOpen(false)} title="Cargar venta a mano"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button><Button onClick={save} disabled={pending}>{pending ? "Guardando…" : "Guardar venta"}</Button></>}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Section>Venta</Section>
          <Field label="Canal *" center><Select value={f.channel} onChange={(e) => set("channel", e.target.value)}>{channels.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          <Field label="Fecha *" center><DatePicker value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>

          <Section>Cliente</Section>
          <div className="col-span-2">
            <Field label="¿Ya es cliente? (opcional)" center>
              <Select value={f.customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Cliente nuevo</option>
                {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
              </Select>
            </Field>
          </div>
          <div className="col-span-2"><Field label="Nombre y apellido *" center><Input value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" /></Field></div>
          <Field label="Teléfono *" center><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" autoComplete="off" /></Field>
          <Field label="DNI" center><Input value={f.dni} onChange={(e) => set("dni", e.target.value)} inputMode="numeric" autoComplete="off" /></Field>
          <div className="col-span-2"><Field label="Usuario (@instagram)" center><Input value={f.handle} onChange={(e) => set("handle", e.target.value)} autoComplete="off" /></Field></div>

          <Section>Entrega</Section>
          <div className="col-span-2"><Field label="Dirección de entrega *" center><Input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Calle, número, piso/depto" autoComplete="off" /></Field></div>
          <Field label="Localidad *" center><Input value={f.city} onChange={(e) => set("city", e.target.value)} autoComplete="off" /></Field>
          <Field label="Código postal" center><Input value={f.zip} onChange={(e) => set("zip", e.target.value)} autoComplete="off" /></Field>
          <Field label="Cómo se envía" center><Select value={f.carrier} onChange={(e) => set("carrier", e.target.value)}>{CARRIERS.filter((c) => c[0] !== "logistica_ml").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Entrega estimada" center><DatePicker value={f.eta} onChange={(e) => set("eta", e.target.value)} /></Field>

          <Section>Productos</Section>
          <div className="col-span-2 space-y-3">
            {lines.map((l, i) => (
              <div key={l.key} className="space-y-2 rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <Select value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)} aria-label={`Producto ${i + 1}`}>
                    <option value="">Elegir producto…</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((x) => x.filter((y) => y.key !== l.key))} aria-label="Quitar producto" className="h-9 w-9 shrink-0 rounded-md border border-line text-muted hover:text-danger">✕</button>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Cantidad" center><Input type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="text-center" /></Field>
                  <Field label="Precio unitario" center><CurrencyInput value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} className="pl-10!" /></Field>
                  <Field label="Descuento %" center><Input type="number" min="0" max="100" step="any" value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} className="text-center" placeholder="0" /></Field>
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setLines((l) => [...l, { key: Date.now(), productId: "", qty: "1", unitPrice: "", discountPct: "" }])}>+ Agregar otro producto</Button>
            <p className="text-center text-sm font-semibold">Total de la venta: {ars(total)}</p>
          </div>

          <Section>Pago y notas</Section>
          <Field label="Forma de pago" center><Select value={f.payMethod} onChange={(e) => set("payMethod", e.target.value)}><option value="">Elegir…</option>{payMethods.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
          <Field label="Gastos de la venta" center><CurrencyInput value={f.extraCosts} onChange={(e) => set("extraCosts", e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Notas del pedido" center><textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Horario, referencias del domicilio, aclaraciones…" className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></Field></div>

          <p className="col-span-2 text-center text-xs text-muted">Al guardar: se suma a Ventas, se descuenta el stock y entra a Envíos en la etapa “Compra”.</p>
          {error && <div className="col-span-2"><Alert tone="danger" title={error} /></div>}
        </div>
      </Drawer>
    </>
  );
}
