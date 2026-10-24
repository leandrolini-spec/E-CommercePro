import type { CompanyInfo } from "./types";
import { deliveryRules, diasLabel, horarioLabel } from "./delivery";

/**
 * Bienvenida a un comprador de Mercado Libre: son TRES mensajes seguidos (Mercado Libre acepta hasta 350 caracteres cada uno).
 *  1) el pedido de datos (teléfono y dirección) · 2) envíos locales · 3) envíos al interior.
 * Los días y el horario de reparto salen de Configuración → Sistema (reglas de entrega). Sin negritas ni emojis: Mercado Libre no los muestra.
 */
export function welcomeParts(company?: CompanyInfo): string[] {
  const r = deliveryRules(company);
  return [
    "¡Gracias por tu compra en nuestra tienda!\n\nPara coordinar la entrega y avisarte cuando salga tu pedido, respondenos por acá completando:\nTeléfono:\nDirección (calle y número):\nLocalidad:",
    `ENVÍOS LOCALES: repartimos los ${diasLabel(r)} ${horarioLabel(r)}. Según el día en que compraste, te llega en alguno de esos días. El horario exacto depende del recorrido.`,
    "ENVÍOS AL INTERIOR: se despachan por transporte y el costo se informa antes de enviar. Si querés, te lo cotizamos.\n\nCualquier duda, escribinos. ¡Saludos!",
  ];
}
/** Los tres mensajes juntos, para mostrarlos o copiarlos. */
export const welcomeText = (company?: CompanyInfo) => welcomeParts(company).join("\n\n");

/** El envío automático solo vale para pedidos de productos (lo único que sí o sí hay que coordinar). */
export const isProductos = (p?: { name?: string; category?: string }) => /pack/i.test(`${p?.category ?? ""} ${p?.name ?? ""}`);

/** Bienvenida a un comprador de Tienda Nube: la tienda ya trae sus datos, así que no se los pide; avisa que en breve se le cuenta de la entrega. */
export function welcomeTnText({ first, empresa, instagram, web }: { first: string; empresa: string; instagram?: string; web?: string }) {
  const insta = (instagram ?? "").trim();
  const instaUrl = !insta ? "" : /^https?:\/\//.test(insta) ? insta : `https://www.instagram.com/${insta.replace(/^@/, "")}`;
  const webUrl = (web ?? "").trim() ? (/^https?:\/\//.test(web!.trim()) ? web!.trim() : `https://${web!.trim()}`) : "";
  const links = [instaUrl && `Instagram: ${instaUrl}`, webUrl && `Tienda online: ${webUrl}`].filter(Boolean).join("\n");
  return `Hola${first ? ` ${first}` : ""}! Gracias por tu compra en ${empresa}. En breve te escribimos para contarte los detalles de la entrega de tu pedido.${links ? `\n\n${links}` : ""}\n\n¡Saludos!`;
}
