"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Drawer } from "@/components/ui/overlays";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { createKit } from "@/modules/actions";

type P = { id: string; name: string; price: number };
type Ctx = { selected: string[]; toggle: (id: string) => void; clear: () => void };
const SelectionContext = createContext<Ctx | null>(null);

// La selección se guarda en la sesión del navegador: no se pierde al cambiar de filtro, de página o de solapa,
// así se pueden juntar productos publicados y no publicados en el mismo kit.
const KEY = "crm_kit_seleccion";
let cache = { raw: "[]", ids: [] as string[] };
const SERVER: string[] = [];
const listeners = new Set<() => void>();
function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY) ?? "[]";
    if (raw !== cache.raw) cache = { raw, ids: JSON.parse(raw) as string[] };
  } catch { /* sin almacenamiento: la selección dura hasta recargar */ }
  return cache.ids;
}
function write(ids: string[]) {
  cache = { raw: JSON.stringify(ids), ids };
  try { sessionStorage.setItem(KEY, cache.raw); } catch { /* idem */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2, maximumFractionDigits: 2 }).format(n);

/** Rodea la tabla de productos: guarda cuáles están tildados y muestra la barra para crear un kit. */
export function KitSelection({ products, children }: { products: P[]; children: ReactNode }) {
  const stored = useSyncExternalStore(subscribe, read, () => SERVER);
  // Solo cuentan los productos que existen en la lista (por si uno se borró o cambió de tipo).
  const selected = useMemo(() => stored.filter((id) => products.some((p) => p.id === id)), [stored, products]);
  const ctx = useMemo<Ctx>(() => ({
    selected, clear: () => write([]),
    toggle: (id) => write(read().includes(id) ? read().filter((x) => x !== id) : [...read(), id]),
  }), [selected]);
  return (
    <SelectionContext.Provider value={ctx}>
      {children}
      <KitBar products={products} />
    </SelectionContext.Provider>
  );
}

/** Cuadradito del título de la tabla: tilda o destilda todos los productos que se están viendo. */
export function KitCheckAll({ ids }: { ids: string[] }) {
  const c = useContext(SelectionContext);
  if (!c) return null;
  const unique = [...new Set(ids)];
  const all = unique.length > 0 && unique.every((id) => c.selected.includes(id));
  return (
    <input type="checkbox" checked={all} onChange={() => unique.forEach((id) => { if (all === c.selected.includes(id)) c.toggle(id); })}
      aria-label="Elegir todos los productos que se ven" title="Elegir todos los que se ven" className="h-4 w-4 cursor-pointer rounded border-line accent-black" />
  );
}

/** Cuadradito de la tabla para tildar un producto. */
export function KitCheck({ id, name }: { id: string; name: string }) {
  const c = useContext(SelectionContext);
  if (!c) return null;
  return (
    <label className="flex h-8 w-8 cursor-pointer items-center justify-center" title="Elegir para armar un kit">
      <input type="checkbox" checked={c.selected.includes(id)} onChange={() => c.toggle(id)} aria-label={`Elegir ${name} para un kit`}
        className="h-4 w-4 cursor-pointer rounded border-line accent-black" />
    </label>
  );
}

function KitBar({ products }: { products: P[] }) {
  const c = useContext(SelectionContext)!;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const chosen = c.selected.map((id) => products.find((p) => p.id === id)).filter(Boolean) as P[];
  const q = (id: string) => Math.max(1, Math.round(Number(qty[id]) || 1));
  const sumPrice = chosen.reduce((s, p) => s + p.price * q(p.id), 0);
  const lines = chosen.map((p) => `${q(p.id)} × ${p.name}`);
  const suggested = chosen.length ? `Kit ${chosen.map((p) => p.name.split(" ").slice(0, 2).join(" ")).join(" + ")}` : "";

  if (!c.selected.length) return null;

  function submit() {
    setError(null);
    start(async () => {
      try {
        await createKit({ name: name.trim() || suggested, price: Number(price) || sumPrice, description: `Kit de venta: ${lines.join(" + ")}`, items: chosen.map((p) => ({ productId: p.id, qty: q(p.id) })) });
        setOpen(false); c.clear(); setName(""); setPrice(""); setQty({});
        router.push("/productos?tab=kits");
      } catch (e) { setError((e as Error).message || "No se pudo crear el kit."); }
    });
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="flex flex-wrap items-center gap-3 rounded-full border border-line bg-surface px-5 py-2.5 shadow-xl">
          <span className="text-sm font-semibold">{c.selected.length} producto{c.selected.length === 1 ? "" : "s"} elegido{c.selected.length === 1 ? "" : "s"}</span>
          <span className="hidden max-w-md flex-wrap gap-1 md:flex">
            {chosen.slice(0, 4).map((p) => (
              <button key={p.id} type="button" onClick={() => c.toggle(p.id)} title="Quitar de la selección" className="max-w-40 truncate rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary hover:bg-primary/20">{p.name} ✕</button>
            ))}
            {chosen.length > 4 && <span className="self-center text-xs text-muted">+{chosen.length - 4} más</span>}
          </span>
          <button type="button" onClick={c.clear} className="text-xs text-muted underline hover:text-ink">Limpiar</button>
          <Button disabled={c.selected.length < 2} onClick={() => { setError(null); setOpen(true); }} className="h-9 rounded-full px-4">
            🎁 Crear kit de venta
          </Button>
          {c.selected.length < 2 && <span className="text-xs text-muted">Elegí al menos 2</span>}
        </div>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Crear kit de venta">
        <div className="space-y-4">
          <Field label="Nombre del kit *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} /></Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Lleva</p>
            <ul className="space-y-2">
              {chosen.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-muted">{money(p.price)} c/u</span></span>
                  <label className="flex items-center gap-1.5 text-xs text-muted">Cant.<Input type="number" min="1" value={qty[p.id] ?? "1"} onChange={(e) => setQty((s) => ({ ...s, [p.id]: e.target.value }))} className="w-16 text-right" /></label>
                </li>
              ))}
            </ul>
          </div>
          <Field label={`Precio de venta del kit (suma de los productos: ${money(sumPrice)})`}>
            <Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={String(sumPrice)} />
          </Field>
          <div className="rounded-lg border border-line bg-surface p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Descripción (se arma sola)</p>
            <p className="mt-1">Kit de venta: {lines.join(" + ")}</p>
            <p className="mt-2 text-xs text-muted">El costo y el stock del kit se calculan solos con lo que lleva. Lo vas a encontrar en la solapa <strong>Kits</strong>.</p>
          </div>
          {error && <Alert tone="danger" title={error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={pending} onClick={submit}>{pending ? "Creando…" : "Crear kit"}</Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
