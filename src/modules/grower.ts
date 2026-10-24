import type { Db } from "./types";

/** Pedidos de productos paral productor: el texto de WhatsApp con el nombre de cada persona y su encargo. */
export type GrowerOrder = { name: string; items: string; orderRef: string; channel: string; entrega: string; notes: string };

/** Es un pedido de productos (los kits y demás productos no van al productor). */
export const isProductosOrder = (items: string) => /pack/i.test(items);

/** El productor se carga en Proveedores (nombre, empresa o rubro "Productor"): de ahí salen su nombre y su WhatsApp. */
export function findGrower(db: Db): { name: string; phone: string } | null {
  const s = db.suppliers.find((x) => /productor/i.test(`${x.name} ${x.company} ${x.category ?? ""} ${x.contactName ?? ""}`));
  if (!s) return null;
  const personal = (s.contactName || s.name || "").trim();
  return { name: /productor/i.test(personal) ? "" : personal, phone: s.phone || "" };
}

const cap = (t: string) => t.trim().replace(/^./, (c) => c.toUpperCase());

/**
 * Separa el pedido en: producto(s) ("1 × Pack de 70 …"), detalle de la pack (lo que va adentro, uno por renglón) y aclaración.
 * El detalle se escribe en el pedido como texto corrido con comas; acá se pasa a lista vertical.
 */
export function splitOrderItems(items: string) {
  const lines = items.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const products: string[] = [];
  const rest: string[] = [];
  for (const l of lines) {
    if (/^\d+\s*×/.test(l)) products.push(...l.split(" · ").map((x) => x.trim()).filter(Boolean));
    else rest.push(l);
  }
  // "…ítem A, ítem B - cambiar el ítem C si hay": lo que va después del guion es una aclaración.
  const joined = rest.join(", ");
  const [listPart, ...noteParts] = joined.split(/\s+[-–—]\s+/);
  const detail = listPart.split(/[,;]/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean).map(cap);
  const aclaracion = noteParts.join(" - ").trim();
  return { products, detail, aclaracion: aclaracion ? cap(aclaracion) : "" };
}

/**
 * Qué lleva cada pack: se le manda solo al productor, junto con el pedido (nunca a los clientes).
 * Para cambiarlo, editá estos textos. "Pack de 50" es la de 45 productos, que se arma como de 50.
 */
export const TRAY_COMPOSITION: { key: "200" | "70" | "70e" | "50"; name: string; /** Nombre para el cliente, si es distinto del del productor. */ publicName?: string; /** Cómo se escribe en el pedido al productor. */ label: string; detail: string }[] = [
  { key: "200", name: "Pack de 200", label: "Pack de 200", detail: "Contenido del pack de 200 (editá este texto)" },
  { key: "70", name: "Pack de 70", label: "Pack de 70", detail: "Contenido del pack de 70 (editá este texto)" },
  { key: "70e", name: "Pack de 70 Especial", label: "Pack de 70 Especial", detail: "Contenido del pack de 70 especial (editá este texto)" },
  { key: "50", name: "Pack de 50", publicName: "Pack de 45", label: "Pack de 50", detail: "Contenido del pack de 50 (editá este texto)" },
];

/** Qué pack es un producto del pedido ("1 × Pack de 200 …", "2 × Pack de 70 Especial …") y cuántas se pidieron. */
export function trayOf(line: string): { tray: (typeof TRAY_COMPOSITION)[number]; qty: number } | null {
  const m = line.match(/^(\d+)\s*×\s*(.+)$/);
  if (!m) return null;
  const size = m[2].match(/\b(200|70|50|45)\b/)?.[1];
  if (!size) return null;
  const key = size === "200" ? "200" : size === "70" ? (/especial/i.test(m[2]) ? "70e" : "70") : "50";
  return { tray: TRAY_COMPOSITION.find((t) => t.key === key)!, qty: Number(m[1]) || 1 };
}

// Mensaje prolijo y espaciado: una línea por dato, con renglón en blanco entre uno y otro (*texto* es negrita en WhatsApp).
const block = (o: GrowerOrder, i: number, n: number) => {
  const it = splitOrderItems(o.items);
  return [
    n > 1 ? `*PEDIDO ${i + 1} de ${n}*` : "*PEDIDO*",
    `*Nombre:*\n${o.name || "Cliente"}`,
    // Cada pack va con su descripción definitiva; si pidió más de una, se aclara que es "cada una".
    `*Encargo:*\n${it.products.length ? it.products.map((l) => { const t = trayOf(l); return `• ${t ? `${t.qty} × ${t.tray.label}: ${t.tray.detail}${t.qty > 1 ? " (cada una)" : ""}` : l}`; }).join("\n") : "• (sin detalle cargado)"}`,
    it.detail.length ? `*Detalle de la pack:*\n${it.detail.map((d) => `• ${d}`).join("\n")}` : "",
    it.aclaracion ? `*Aclaración:*\n${it.aclaracion}${/[.!?]$/.test(it.aclaracion) ? "" : "."}` : "",
    o.notes && o.notes.length <= 140 ? `*Nota:*\n${o.notes.replace(/\s+/g, " ")}` : "",
  ].filter(Boolean).join("\n\n");
};

/** Texto para mandar por WhatsApp (sin emojis). */
export function growerMessage(orders: GrowerOrder[], growerName: string) {
  const first = growerName.trim().split(/\s+/)[0] ?? "";
  const head = `Hola${first ? ` ${first}` : ""}!\n\n${orders.length === 1 ? "Te paso el pedido de productos para preparar:" : `Te paso los pedidos de productos para preparar (${orders.length}):`}`;
  return `${head}\n\n- - - - - - - - - - - - - - - -\n\n${orders.map((o, i) => block(o, i, orders.length)).join("\n\n- - - - - - - - - - - - - - - -\n\n")}\n\n- - - - - - - - - - - - - - - -\n\nCualquier duda avisame. ¡Gracias!`;
}
