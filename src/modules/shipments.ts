import type { ProjectSettings, ShipStage } from "./types";

/** Etapas con las que arranca el seguimiento de envíos. Se pueden cambiar, agregar y reordenar desde la pantalla Envíos. */
export const DEFAULT_SHIPMENT_STAGES: ShipStage[] = [
  { id: "compra", name: "Compra", color: "#7c3aed" },
  { id: "preparado", name: "Preparado", color: "#0d9488" },
  { id: "empaquetado", name: "Empaquetado", color: "#f59e0b" },
  { id: "en_viaje", name: "En viaje", color: "#2563eb" },
  { id: "entregado", name: "Entregado", color: "#16a34a" },
  { id: "no_entregado", name: "No se entregó", color: "#dc2626" },
  { id: "volvio", name: "Volvió a depósito", color: "#64748b" },
];
const PALETTE = ["#f59e0b", "#2563eb", "#16a34a", "#dc2626", "#64748b", "#7c3aed", "#db2777", "#0891b2", "#ea580c", "#4d7c0f"];

export const stagesOf = (s: Pick<ProjectSettings, "shipmentStages">): ShipStage[] => (s.shipmentStages?.length ? s.shipmentStages : DEFAULT_SHIPMENT_STAGES);
export const stageColor = (i: number) => PALETTE[i % PALETTE.length];
export const slugify = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "etapa";

/**
 * Etapa que corresponde al estado de un envío de Mercado Libre. Devuelve el id de la etapa por defecto;
 * el llamador solo la usa si esa etapa existe (el usuario puede haberla borrado o renombrado).
 */
export function mlStageId(status: string, substatus?: string | null): string {
  const st = (status || "").toLowerCase(), sub = (substatus || "").toLowerCase();
  if (st === "shipped") return "en_viaje";
  if (st === "delivered") return "entregado";
  if (st === "not_delivered") return /return|back|sender|warehouse|depos/.test(sub) ? "volvio" : "no_entregado";
  if (st === "cancelled") return "no_entregado";
  if (st === "handling" || st === "ready_to_ship") return "empaquetado";
  return "compra"; // pending: se compró y todavía no se empezó a preparar
}

/**
 * Mensajes de WhatsApp que se proponen por etapa (editables). Variables: {nombre} {productos} {direccion} {repartidor} {vehiculo} {patente} {fecha} {tienda} {instagram} {empresa} {entrega} {horario} {seguimiento} {enlace} {dias}.
 * Lo que va entre [[ ]] solo se incluye si todas sus variables tienen dato (así no quedan frases con huecos).
 */
// Al pie de todos los mensajes: la tienda online y el Instagram (solo las líneas que tengan dato, cargado en Configuración → Empresa).
// Sin emojis: en algunos WhatsApp de escritorio los emojis llegan como "�".
const FOOT = "\n\n[[• Tienda online: {tienda}]][[\n• Instagram: {instagram}]]";

export const DEFAULT_MESSAGES: Record<string, string> = {
  compra: "Hola {nombre}! Gracias por tu compra y por confiar en {empresa}.\n\n[[Tu pedido está programado para el *{entrega}* {horario}.\n\n]]¡Muchas gracias!\nEquipo de {empresa}" + FOOT,
  preparado: "Hola {nombre}! Tu pedido ya está preparado.\n\n[[Te lo entregamos el *{entrega}* {horario}.\n\n]]¡Gracias por tu paciencia!\nEquipo de {empresa}" + FOOT,
  empaquetado: "Hola {nombre}! Estamos empaquetando tu pedido[[ ({productos})]] con mucho cuidado para enviártelo.\n\n[[Te lo entregamos el *{entrega}* {horario}.\n\n]]¡Gracias por tu paciencia!\nEquipo de {empresa}" + FOOT,
  en_viaje: "Hola {nombre}! Tu pedido ya salió y va camino[[ a {direccion}]].[[\n\nLo lleva {repartidor}.]][[\nVehículo: {vehiculo}.]][[\nPatente: {patente}.]]\n\n¡Que lo disfrutes mucho!\n\n¡Gracias!\nEquipo de {empresa}" + FOOT,
  // Envíos por Vía Cargo (al interior): el plazo depende del destino, así que no se promete fecha; se pasa el número de seguimiento.
  compra_viacargo: "Hola {nombre}! Gracias por tu compra.\n\nTu pedido viaja por Vía Cargo. Apenas lo despachemos te avisamos. Recordá que lo retirás en la agencia de tu destino y que el costo del envío lo abonás ahí mismo.\n\n¡Muchas gracias!\nEquipo de {empresa}" + FOOT,
  preparado_viacargo: "Hola {nombre}! Tu pedido ya está preparado y lo despachamos por Vía Cargo.\n\n¡Gracias por tu paciencia!\nEquipo de {empresa}" + FOOT,
  empaquetado_viacargo: "Hola {nombre}! Estamos empaquetando tu pedido[[ ({productos})]] con mucho cuidado. Lo despachamos por Vía Cargo hoy mismo.\n\n¡Gracias por tu paciencia!\nEquipo de {empresa}" + FOOT,
  en_viaje_viacargo: "Hola {nombre}! Despachamos tu pedido por Vía Cargo.[[\n\nTu número de seguimiento es: *{seguimiento}*]]\n\nCualquier cosa, avisanos por acá.\n\n¡Gracias!\nEquipo de {empresa}" + FOOT,
  // El cierre invita a seguirnos en Instagram y recuerda la tienda online (en lugar del pie común).
  entregado: "Hola {nombre}! Tu pedido figura como entregado. ¡Esperamos que lo disfrutes mucho!\n[[\nNos encantaría que nos sigas en Instagram y nos cuentes cómo te fue con tu compra: {instagram}]]\n\n¡Gracias por elegirnos!\nEquipo de {empresa}",
  no_entregado: "Hola {nombre}! Intentamos entregarte el pedido y no te encontramos en tu dirección.\n\n¿Cuándo podemos pasar de nuevo? Aguardamos tu respuesta para coordinar un nuevo envío.\n\n¡Muchas gracias!\nEquipo de {empresa}" + FOOT,
  volvio: "Hola {nombre}! Tu pedido volvió a nuestro depósito.\n\nCoordinemos una nueva entrega cuando te quede bien.\n\n¡Muchas gracias!\nEquipo de {empresa}" + FOOT,
};

export type MessageVars = { nombre: string; productos: string; direccion: string; repartidor: string; vehiculo: string; patente: string; fecha: string; tienda?: string; instagram?: string; empresa?: string; entrega?: string; horario?: string; retiro?: string; seguimiento?: string; enlace?: string; dias?: string };

export function renderMessage(template: string, v: MessageVars) {
  const val = (k: string) => (v as Record<string, string>)[k] ?? "";
  const withBlocks = template.replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => {
    const vars = [...inner.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return vars.every((k) => val(k).trim()) ? inner.replace(/\{(\w+)\}/g, (_m, k: string) => val(k)) : "";
  });
  return withBlocks.replace(/\{(\w+)\}/g, (_, k: string) => val(k)).replace(/[ \t]{2,}/g, " ").replace(/ ([.,!?:])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}
