import Link from "next/link";
import { IconPencil, IconWhatsApp } from "@/components/shared/icons";
import { waLink } from "@/lib/contact";
import { findGrower, growerMessage, type GrowerOrder } from "@/modules/grower";
import type { Db } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const btn = "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition max-md:h-auto max-md:min-h-9 max-md:w-full max-md:whitespace-normal max-md:py-2 max-md:text-center";

/** Productor: sus datos salen de Proveedores y los pedidos nuevos de productos se le mandan por WhatsApp con un toque (nombre de cada persona y su encargo). */
export function GrowerCard({ db, orders }: { db: Db; orders: GrowerOrder[] }) {
  const g = findGrower(db);
  const link = orders.length && g?.phone ? waLink(g.phone, growerMessage(orders, g.name)) : null;
  const off = `${btn} cursor-not-allowed border-line bg-bg text-muted/60`;
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:text-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Productor</h2>
          {g
            ? <p className="mt-0.5 text-sm"><strong>{g.name || "Productor"}</strong><span className="text-muted">{g.phone ? ` · ${g.phone}` : " · falta cargar su WhatsApp en Proveedores"}</span></p>
            : <p className="mt-0.5 text-sm text-muted">Cargá un proveedor llamado <strong>Productor</strong> en Proveedores, con su WhatsApp, para mandarle los pedidos de productos.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
          {link
            ? <a href={link} target="_blank" rel="noreferrer" title="Se abre WhatsApp con el mensaje armado: el envío lo hacés vos" className={`${btn} border-[#16a34a]/40 bg-[#16a34a] text-white hover:bg-[#15803d]`}><IconWhatsApp />Mandar pedidos al productor ({orders.length})</a>
            : <span title={g?.phone ? "No hay pedidos nuevos de productos" : "Falta el WhatsApp del productor: cargalo en Proveedores"} className={off}><IconWhatsApp />Mandar pedidos al productor ({orders.length})</span>}
          <Link href="/proveedores" className={`${btn} border-line bg-surface text-ink hover:bg-bg`}><IconPencil />{g ? "Editar en Proveedores" : "Ir a Proveedores"}</Link>
        </div>
      </div>
      <Guide className="mt-3" title="¿Cómo se arma el mensaje al productor?">Los pedidos de productos que están en Compra, Preparado o Empaquetado se arman en un solo mensaje, ordenado, con el nombre de cada persona y su encargo. El mensaje lo mandás vos.</Guide>
    </section>
  );
}
