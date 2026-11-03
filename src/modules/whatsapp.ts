/** WhatsApp con la API oficial de Meta: tipos y reglas puras (sin red ni base), que usan tanto el servidor como las pantallas. */

/** Plantilla de mensaje: la crea cada negocio y la aprueba Meta. Las variables se escriben {{1}}, {{2}}… en el texto. */
export type WaTemplate = {
  id: string; name: string; category: "UTILITY" | "MARKETING"; language: string;
  status: "APPROVED" | "PENDING" | "REJECTED"; body: string;
  /** Qué significa cada variable, en orden (ej. ["nombre", "seguimiento"]). */
  vars: string[];
  /** Motivo del rechazo, si Meta la rechazó. */
  reason?: string; createdAt: string;
};

/** Aviso automático al cambiar un envío de etapa: qué plantilla se manda en esa etapa. */
export type WaAutomation = { stage: string; enabled: boolean; templateId: string };

/** Configuración de WhatsApp de un negocio (se guarda en settings.company.whatsappApi). */
export type WaConfig = { templates?: WaTemplate[]; automations?: WaAutomation[]; signature?: string };

/** Variables que se pueden usar en las plantillas de aviso de envío y de dónde sale cada una. */
export const WA_VARS: { key: string; label: string; example: string }[] = [
  { key: "nombre", label: "Nombre del cliente", example: "Ana" },
  { key: "negocio", label: "Nombre del negocio", example: "Mi negocio" },
  { key: "producto", label: "Producto del pedido", example: "Termo acero 1 L" },
  { key: "seguimiento", label: "Enlace de seguimiento", example: "https://…/seguimiento/abc" },
  { key: "etapa", label: "Etapa del envío", example: "En viaje" },
];

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ventana de 24 horas: se puede escribir libre hasta 24 h después del último mensaje del cliente; pasado ese tiempo solo con plantilla. */
export function windowLeft(lastInboundAt: string | undefined, now = Date.now()): { open: boolean; ms: number; label: string } {
  const at = lastInboundAt ? Date.parse(lastInboundAt) : NaN;
  if (!Number.isFinite(at)) return { open: false, ms: 0, label: "Sin mensajes del cliente" };
  const ms = Math.max(0, at + WINDOW_MS - now);
  if (ms === 0) return { open: false, ms: 0, label: "Ventana cerrada" };
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return { open: true, ms, label: h > 0 ? `${h} h ${m} min` : `${m} min` };
}

/** Reemplaza {{1}}, {{2}}… por los valores en orden. */
export function fillTemplate(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] ?? "");
}

/** Cantidad de variables que usa un texto ({{1}} … {{n}}). */
export const varCount = (body: string) => new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

/** Solo dígitos del teléfono, listo para la API (sin "+" ni espacios). */
export const waPhone = (phone: string) => phone.replace(/\D/g, "");

/** Estado de entrega de un mensaje enviado. */
export type WaDelivery = "sent" | "delivered" | "read" | "failed";
export const DELIVERY_LABEL: Record<WaDelivery, string> = { sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "No se pudo enviar" };
