import { isExternal } from "./carriers";
import type { Db, Shipment } from "./types";

/** Datos del remitente (para las etiquetas de Vía Cargo, Andreani y Correo Argentino): el titular del CUIT o, si falta, la empresa. */
export const labelOwner = (db: Db) => {
  const c = db.settings.company ?? {};
  return { name: c.holderName || c.legalName || db.settings.name, doc: c.holderDoc || c.cuit || "", phone: c.holderPhone || c.phone || c.whatsapp || "", city: [c.city, c.province].filter(Boolean).join(", "), zip: c.zip || "" };
};

/** Cliente de un envío: el de su venta o, si el envío se cargó suelto, el que tenga el mismo teléfono. */
export function customerOfShipment(db: Db, x: Shipment) {
  const bySale = db.customers.find((c) => c.id === db.sales.find((s) => s.id === x.saleId)?.customerId);
  if (bySale) return bySale;
  const last10 = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10);
  const k = last10(x.phone);
  return k.length >= 6 ? db.customers.find((c) => last10(c.phone) === k) : undefined;
}

export const labelCustomerDoc = (db: Db, x: Shipment) => customerOfShipment(db, x)?.doc ?? "";

/** Qué falta para que la etiqueta sirva. */
export function labelMissing(db: Db, x: Shipment): string[] {
  const base = [!x.customer?.trim() && "nombre", !x.address?.trim() && "dirección", !x.city?.trim() && "localidad", !x.phone?.trim() && "teléfono"].filter(Boolean) as string[];
  if (!isExternal(x.carrier)) return base;
  return [...base, !labelCustomerDoc(db, x).trim() && "DNI del destinatario", !x.zip?.trim() && "código postal"].filter(Boolean) as string[];
}

/** Medio de compra y número de compra, chiquito: el medio solo si es Mercado Libre o Tienda Nube. */
export const labelPurchase = (x: Shipment) => [["Mercado Libre", "Tienda Nube"].includes(x.channel) ? x.channel : "", x.orderRef ? `Compra ${x.orderRef}` : ""].filter(Boolean).join(" · ");
