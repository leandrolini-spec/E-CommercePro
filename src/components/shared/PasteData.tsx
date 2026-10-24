"use client";

import { useState, useTransition } from "react";
import { Drawer } from "@/components/ui/overlays";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { applyDetectedData } from "@/modules/actions";
import { extractContact, type Detected } from "@/modules/extract";

const FIELDS: [keyof Detected, string][] = [["name", "Nombre y apellido"], ["phone", "Teléfono"], ["address", "Dirección"], ["city", "Localidad"], ["zip", "Código postal"], ["doc", "DNI"]];

/** Pegar el mensaje del comprador (de Mercado Libre, WhatsApp o Instagram): se separan los datos, se revisan y se cargan. */
export function PasteData({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [vals, setVals] = useState<Detected>({});
  const [detected, setDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const detect = () => { setVals(extractContact(text)); setDetected(true); setError(null); };
  const save = () => {
    setError(null);
    const fd = new FormData();
    for (const [k] of FIELDS) fd.set(k, vals[k] ?? "");
    start(async () => {
      try {
        const r = await applyDetectedData(customerId, fd);
        if (r && "error" in r) { setError(r.error); return; }
        setOpen(false); setText(""); setVals({}); setDetected(false);
      } catch { setError("No se pudo guardar. Revisá los datos e intentá de nuevo."); }
    });
  };
  const found = FIELDS.filter(([k]) => vals[k]).length;
  return (
    <>
      <Button variant="secondary" className={compact ? "h-8 px-2.5 py-0 text-xs" : "h-9"} onClick={() => setOpen(true)} title="Pegá el mensaje del comprador y se cargan sus datos">Pegar datos</Button>
      <Drawer
        open={open} onClose={() => setOpen(false)} title="Pegar datos del comprador"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>{detected && <Button onClick={save} disabled={pending || found === 0}>{pending ? "Guardando…" : "Cargar datos"}</Button>}</>}
      >
        <div className="space-y-4">
          <Field label="Mensaje del comprador">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Pegá acá lo que te escribió: teléfono, dirección, localidad…" className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </Field>
          <Button variant="secondary" onClick={detect} disabled={!text.trim()}>Detectar datos</Button>
          {detected && (
            <div className="space-y-3">
              {found === 0 ? <Alert tone="warning" title="No encontré datos en ese texto">Probá con otro mensaje o cargalos a mano con el lápiz.</Alert> : <p className="text-xs text-muted">Revisá lo detectado y corregí lo que haga falta. Lo que dejes vacío no se borra.</p>}
              {FIELDS.map(([k, label]) => <Field key={k} label={label}><Input value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} /></Field>)}
            </div>
          )}
          {error && <Alert tone="danger" title={error} />}
        </div>
      </Drawer>
    </>
  );
}
