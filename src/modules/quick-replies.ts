import type { CompanyInfo } from "./types";

export type QuickReply = { title: string; text: string };

/**
 * Respuestas rápidas para las mensajerías (máximo 350 caracteres, sin emojis). Variables: {nombre} {empresa} {productos}.
 * Se pueden cambiar desde Configuración → Sistema → Respuestas rápidas.
 */
export const DEFAULT_QUICK: QuickReply[] = [
  { title: "Bienvenida (coordinar entrega)", text: "¡Gracias por tu compra en {empresa}!\n\nPara coordinar la entrega y avisarte cuando salga tu pedido, respondenos por acá completando:\nTeléfono:\nDirección (calle y número):\nLocalidad:" },
  { title: "Envíos locales", text: "ENVÍOS LOCALES: repartimos los martes y viernes a partir de las 13:00 Hs. Según el día en que compraste, te llega en alguno de esos días. El horario exacto depende del recorrido." },
  { title: "Envíos al interior", text: "ENVÍOS AL INTERIOR: se despachan por transporte y el costo se informa antes de enviar. Si querés, te lo cotizamos.\n\nCualquier duda, escribinos. ¡Saludos!" },
  { title: "Bienvenida (otros productos)", text: "Hola {nombre}! Gracias por tu compra en {empresa}. Tu pedido se despacha por la logística: apenas salga te llega el aviso con el seguimiento. No hace falta que hagas nada. Cualquier duda, escribinos. ¡Saludos!" },
  { title: "Reconfirmar datos", text: "Hola {nombre}! Para dejar todo listo con tu pedido, ¿nos reconfirmás tu domicilio de entrega y un número de teléfono? ¡Muchas gracias!" },
  { title: "Volver a pedir datos", text: "Hola {nombre}! Te escribimos de nuevo porque todavía necesitamos tu número de teléfono y tu domicilio para coordinar la entrega de {productos}. ¿Nos los pasás cuando puedas? ¡Gracias!" },
  { title: "Pedido despachado", text: "Hola {nombre}! Tu pedido ya salió y va camino a tu domicilio. Cualquier cosa, avisanos por acá. ¡Gracias por tu compra!" },
  { title: "Aviso de demora", text: "Hola {nombre}! Te avisamos que tu pedido se demora un poco más de lo previsto. Estamos trabajando para despacharlo lo antes posible. Disculpá las molestias y gracias por la paciencia." },
  { title: "Posventa", text: "Hola {nombre}! ¿Cómo te fue con tu compra? Queremos saber si te llegó bien. Si tenés alguna duda, preguntanos. ¡Gracias por elegirnos!" },
  { title: "Pedir opinión", text: "Hola {nombre}! Si estás conforme con tu compra, nos ayudás mucho con una calificación en Mercado Libre. ¡Muchas gracias!" },
  { title: "Gracias", text: "Hola {nombre}! Muchas gracias por tu compra en {empresa}. Cualquier cosa, escribinos. ¡Saludos!" },
];

/** Mercado Libre acepta 350 caracteres por mensaje: para mandar varios seguidos (hasta 3) se separan con una línea que diga solo "---". */
export const MSG_SEP = "\n---\n";
export const MAX_MSG = 350;
export const MAX_MSGS = 3;
export const splitMessages = (text: string): string[] => text.split(/\r?\n---\r?\n/).map((t) => t.trim()).filter(Boolean);

export const quickRepliesOf = (company?: CompanyInfo): QuickReply[] => (company?.quickReplies?.length ? company.quickReplies : DEFAULT_QUICK);

/** Reemplaza las variables con los datos del contacto y limpia los huecos ("Hola !" → "Hola!"). */
export function fillQuick(text: string, v: { nombre?: string; empresa?: string; productos?: string }) {
  const first = (v.nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return text
    .replaceAll("{nombre}", first).replaceAll("{empresa}", v.empresa ?? "").replaceAll("{productos}", v.productos || "tu pedido")
    .replace(/Hola ([!,.])/g, "Hola$1").replace(/ {2,}/g, " ").trim();
}

/** Respuestas ya armadas para un contacto, listas para mostrar como botones. */
export const quickFor = (company: CompanyInfo | undefined, empresa: string, v: { nombre?: string; productos?: string }): QuickReply[] =>
  quickRepliesOf(company).map((q) => ({ title: q.title, text: fillQuick(q.text, { ...v, empresa }) }));

/** Texto de configuración: una respuesta por línea, "Título | texto" (\n = salto de línea). */
export const quickToLines = (list: QuickReply[]) => list.map((q) => `${q.title} | ${q.text.replace(/\n/g, "\\n")}`).join("\n");
export function quickFromLines(raw: string): QuickReply[] {
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf("|");
    if (i < 1) throw new Error(`Cada línea va como "Título | texto". Revisá: ${l.slice(0, 40)}…`);
    const title = l.slice(0, i).trim(), text = l.slice(i + 1).trim().replace(/\\n/g, "\n");
    if (!title || !text) throw new Error(`Falta el título o el texto en: ${l.slice(0, 40)}…`);
    const parts = splitMessages(text);
    if (parts.length > MAX_MSGS) throw new Error(`"${title}" tiene ${parts.length} mensajes: se pueden mandar hasta ${MAX_MSGS} seguidos.`);
    const long = parts.findIndex((m) => m.length > MAX_MSG);
    if (long >= 0) throw new Error(`${parts.length > 1 ? `El mensaje ${long + 1} de "${title}"` : `"${title}"`} tiene ${parts[long].length} caracteres: Mercado Libre acepta hasta ${MAX_MSG} por mensaje.`);
    return { title, text };
  });
}

/** Respuestas rápidas para contestar una PREGUNTA de una publicación: las mismas de los mensajes, sin los saludos de bienvenida. */
export const quickForQuestion = (company: CompanyInfo | undefined, empresa: string, v: { nombre?: string; productos?: string }): QuickReply[] =>
  // Las preguntas aceptan 2000 caracteres y se contestan con un solo texto: las partes se unen con una línea en blanco.
  quickFor(company, empresa, v).filter((q) => !/^bienvenida/i.test(q.title)).map((q) => ({ title: q.title, text: splitMessages(q.text).join("\n\n") }));
