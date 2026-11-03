import Link from "next/link";
import { IconPencil, IconWhatsApp } from "@/components/shared/icons";
import { waLink } from "@/lib/contact";
import { findSupplier, supplierMessage, type GrowerOrder } from "@/modules/grower";
import { saveOrderSupplier } from "@/modules/settings-actions";
import type { Db } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const btn = "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition max-md:h-auto max-md:min-h-9 max-md:w-full max-md:whitespace-normal max-md:py-2 max-md:text-center";

/** Proveedor: se elige entre los de Proveedores y los pedidos que hay que preparar se le mandan por WhatsApp con un toque (nombre de cada persona y su encargo). */
export function SupplierCard({ db, orders }: { db: Db; orders: GrowerOrder[] }) {
  const s = findSupplier(db);
  const link = orders.length && s?.phone ? waLink(s.phone, supplierMessage(orders, s.name)) : null;
  const off = `${btn} cursor-not-allowed border-line bg-bg text-muted/60`;
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:text-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Proveedor</h2>
          {s
            ? <p className="mt-0.5 text-sm"><strong>{s.name || "Proveedor"}</strong><span className="text-muted">{s.phone ? ` · ${s.phone}` : " · falta cargar su WhatsApp en Proveedores"}</span></p>
            : <p className="mt-0.5 text-sm text-muted">Elegí el proveedor al que le mandás los pedidos para preparar.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
          {link
            ? <a href={link} target="_blank" rel="noreferrer" title="Se abre WhatsApp con el mensaje armado: el envío lo hacés vos" className={`${btn} border-[#16a34a]/40 bg-[#16a34a] text-white hover:bg-[#15803d]`}><IconWhatsApp />Mandar pedidos al proveedor ({orders.length})</a>
            : <span title={s?.phone ? "No hay pedidos para preparar" : "Elegí un proveedor con WhatsApp cargado"} className={off}><IconWhatsApp />Mandar pedidos al proveedor ({orders.length})</span>}
          <Link href="/proveedores" className={`${btn} border-line bg-surface text-ink hover:bg-bg`}><IconPencil />Ir a Proveedores</Link>
        </div>
      </div>
      <form action={saveOrderSupplier} className="mt-3 flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        <label className="text-sm text-muted" htmlFor="supplierId">Proveedor para los pedidos</label>
        <select id="supplierId" name="supplierId" defaultValue={s?.id ?? ""} className="h-9 min-w-52 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">Ninguno</option>
          {db.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.phone ? "" : " (sin WhatsApp)"}</option>)}
        </select>
        <button type="submit" className={`${btn} border-line bg-surface text-ink hover:bg-bg`}>Guardar</button>
      </form>
      <Guide className="mt-3" title="¿Cómo se arma el mensaje al proveedor?">Los pedidos que están en Compra, Preparado o Empaquetado se arman en un solo mensaje, ordenado, con el nombre de cada persona y su encargo. El mensaje lo mandás vos.</Guide>
    </section>
  );
}
