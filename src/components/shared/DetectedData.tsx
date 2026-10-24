import { applyDetected } from "@/modules/actions";
import type { Detected } from "@/modules/extract";
import type { Customer } from "@/modules/types";

const LABEL: [keyof Detected, string][] = [["name", "Nombre"], ["phone", "Teléfono"], ["address", "Dirección"], ["city", "Localidad"], ["zip", "CP"], ["doc", "DNI"]];

/** Lo que se detectó en los mensajes del comprador y todavía no está cargado: se ve y se carga con un clic. */
export function newDetected(d: Detected, c: Customer): Detected {
  const same = (a?: string, b?: string) => (a ?? "").replace(/\W/g, "").toLowerCase() === (b ?? "").replace(/\W/g, "").toLowerCase();
  const out: Detected = {};
  if (d.phone && !same(d.phone.replace(/\D/g, ""), (c.phone ?? "").replace(/\D/g, ""))) out.phone = d.phone;
  if (d.address && !same(d.address, c.address) && !(c.address ?? "").toLowerCase().includes(d.address.toLowerCase())) out.address = d.address;
  if (d.city && !(c.city ?? "").toLowerCase().includes(d.city.toLowerCase())) out.city = d.city;
  if (d.zip && !(c.address ?? "").includes(d.zip)) out.zip = d.zip;
  if (d.doc && d.doc !== c.doc) out.doc = d.doc;
  if (d.name && !/\s/.test((c.name ?? "").trim())) out.name = d.name; // solo si el cliente figura todavía con su usuario
  return out;
}

export function DetectedData({ customer, found }: { customer: Customer; found: Detected }) {
  const entries = LABEL.filter(([k]) => found[k]);
  if (!entries.length) return null;
  return (
    <form action={applyDetected.bind(null, customer.id)} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <span className="font-semibold text-ink">Datos detectados en la conversación:</span>
      {entries.map(([k, label]) => (
        <span key={k} className="rounded bg-surface px-1.5 py-0.5"><span className="text-muted">{label}:</span> <strong>{found[k]}</strong><input type="hidden" name={k} value={found[k]} /></span>
      ))}
      <button type="submit" className="ml-auto inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover">Cargar</button>
    </form>
  );
}
