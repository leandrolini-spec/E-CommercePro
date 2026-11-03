import { seguimientoUrl } from "@/modules/seguimiento";
import { stagesOf } from "@/modules/shipments";
import type { Db } from "@/modules/types";
import { waPhone } from "@/modules/whatsapp";

/**
 * Datos del cliente para completar las variables de una plantilla (nombre, producto, seguimiento…), buscados por su teléfono
 * en sus envíos y compras. Una variable que no se pueda completar queda vacía: no se manda una plantilla con huecos.
 */
export function waContext(db: Db, phone: string, name: string): Record<string, string> {
  const key = waPhone(phone).slice(-10);
  const same = (p: string) => key.length >= 8 && waPhone(p).slice(-10) === key;
  const ship = [...(db.shipments ?? [])].filter((s) => same(s.phone)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const customer = db.customers.find((c) => same(c.phone));
  const sale = customer ? [...db.sales].filter((s) => s.customerId === customer.id && s.status !== "cancelada").sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  const base = (process.env.APP_BASE_URL || "http://localhost:4850").replace(/\/$/, "");
  const products = sale ? sale.items.map((i) => db.products.find((p) => p.id === i.productId)?.name ?? "").filter(Boolean).join(", ") : "";
  return {
    nombre: name.split(" ")[0] ?? "",
    negocio: db.settings.name,
    producto: (ship?.items || products).slice(0, 80),
    seguimiento: ship ? seguimientoUrl(base, ship.id) : "",
    etapa: ship ? (stagesOf(db.settings).find((s) => s.id === ship.stage)?.name ?? ship.stage) : "",
  };
}
