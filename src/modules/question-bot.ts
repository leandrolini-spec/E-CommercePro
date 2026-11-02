/**
 * Respuestas automáticas a las preguntas de Mercado Libre.
 * Motor puro (sin red ni base): reconoce de qué trata la pregunta y la contesta con el texto que cargó el negocio.
 * Sin texto cargado para ese tipo de pregunta, no contesta (la ve una persona). Nada de lo que se dice sale de acá: todo viene de la configuración.
 */
import type { CompanyInfo } from "./types";

export type QuestionCategory =
  | "contacto" | "factura" | "retiro" | "costo_envio" | "cuando_llega" | "envio_interior" | "envio_zona"
  | "cantidad" | "disponibilidad" | "cortesia";

/** Tipos de pregunta para los que el negocio puede cargar un texto. "zona_gratis" se usa cuando nombran un lugar de la lista de zonas con envío gratis ({zona}). */
export const TEXT_KEYS: { key: string; label: string }[] = [
  { key: "contacto", label: "piden teléfono, mail, redes o contacto" },
  { key: "factura", label: "preguntan por factura" },
  { key: "retiro", label: "quieren retirar en persona" },
  { key: "envio_zona", label: "preguntan si hacen envíos (y cuánto cuesta el envío)" },
  { key: "zona_gratis", label: "nombran una zona de la lista de envío gratis; usá {zona}" },
  { key: "cuando_llega", label: "cuándo llega / cuánto tarda" },
  { key: "envio_interior", label: "envíos al interior del país" },
  { key: "disponibilidad", label: "si tienen un producto o hay stock" },
  { key: "cortesia", label: "un simple gracias / ok / listo" },
];
const KEYS = new Set(TEXT_KEYS.map((k) => k.key));
export const isTextKey = (k: string) => KEYS.has(k);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const INTERIOR = /\b(cordoba|rosario|santa fe|mendoza|tucuman|salta|jujuy|neuquen|rio negro|roca|chubut|madryn|trelew|san juan|san luis|entre rios|parana|corrientes|misiones|posadas|chaco|resistencia|formosa|la pampa|santa rosa|santa cruz|tierra del fuego|ushuaia|mar del plata|bahia blanca|tandil|santiago del estero|catamarca|la rioja|interior|provincia)\b/;

/** Preguntas de alguien que ya compró (reclamos, devoluciones, retiros de lo pagado): las contesta una persona. */
const POSTVENTA = /(pague|pagué|ya compre|ya compré|mi pedido|mi compra|devuelv|reembols|reclamo|no me llego|no llego)/;

/** Todas las intenciones que aparecen en la pregunta (en orden de importancia). Vacío si no se reconoce ninguna. */
export function classifyAll(question: string): QuestionCategory[] {
  const q = norm(question);
  if (!q || POSTVENTA.test(q)) return [];
  // Mensajes largos (consultas comerciales), o que continúan una charla anterior: los contesta una persona.
  if (q.length > 250 || /(mensaje anterior|anteriormente|ya te (pregunte|consulte)|recien te|recien veo|me sirve si)/.test(q)) return [];
  if (/(andreani|correo argentino|\boca\b|mercado ?envios)/.test(q)) return []; // pregunta por un transportista puntual: la contesta una persona
  const has: QuestionCategory[] = [];
  if (!q.includes("?") && q.length <= 45 && /^(ok|dale|perfecto|bueno|genial|gracias|muchas gracias|listo|excelente|quedo atent)\b/.test(q)) return ["cortesia"];
  if (/(telefono|\btel\b|whatsapp|wsp|mail|email|instagram|facebook|redes|contacto|celular|numero de)/.test(q)) has.push("contacto");
  if (/factura/.test(q)) has.push("factura");
  if (/(retir(o|ar|e)|buscar(lo|las|los)? yo|ir a buscar|donde estan|donde quedan|punto de retiro)/.test(q)) has.push("retiro");
  const envio = /(envio|envian|enviar|envias|realizan envios|hacen envios|llegan|llegas|llegamos|entreg|domicilio|mandan|mandar|andreani|correo|forma de entrega|traen|llevan)/.test(q);
  const costo = /(cuanto (sale|cuesta|seria|me saldria|me sale)|costo|precio del envio|valor del envio|cuanto el envio)/.test(q) && /(envio|enviar|mandar)/.test(q);
  const cuando = /(cuando|cuanto (tarda|tardan|demora|tiempo)|tiempo de (envio|entrega)|demora|plazo|llegar(a|ia|an)? (hoy|mañana|esta semana)|para (el )?(dia )?(sabado|domingo|jueves|viernes|martes|lunes)|antes del|coordinar)/.test(q) && !/(semana|mes|año) que viene/.test(q);
  if (costo) has.push(INTERIOR.test(q) ? "envio_interior" : "costo_envio");
  if (cuando) has.push("cuando_llega");
  if (envio && !costo && !cuando) has.push(INTERIOR.test(q) ? "envio_interior" : "envio_zona");
  else if (envio && INTERIOR.test(q) && !has.includes("envio_interior") && !has.includes("costo_envio")) has.push("envio_interior");
  if (/(a medida|a pedido|mayorista|por mayor|comercio|reventa|cantidad|minimo|de a uno|venden de a|armar(me)? (una|un) (publicacion|pedido|combo)|armarme|algo especial)/.test(q)) has.push("cantidad");
  if (!has.includes("cantidad") && /(tenes|tendras|tendran|tienen|vendes|venden|disponible|stock)/.test(q)) has.push("disponibilidad");
  const result = [...new Set(has)];
  // Varias preguntas en el mismo mensaje: si alguna no se entiende, no se contesta (se respondería solo una parte).
  const parts = question.split(/[?¿]/).map((x) => x.trim()).filter((x) => x.length > 14);
  if (parts.length >= 2 && parts.some((x) => !understood(x))) return [];
  return result;
}

const understood = (part: string): boolean =>
  /(envio|enviar|llega|entreg|cuando|tarda|tenes|tienen|factura|retir|costo|precio|cantidad|disponible|stock)/.test(norm(part));

/** Primera zona de la lista que se nombra en la pregunta (por palabras completas), o null. */
export function zonaEnPregunta(question: string, zonas: string[] = []): string | null {
  const q = norm(question);
  for (const z of zonas) {
    const n = norm(z);
    if (n.length >= 3 && new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(q)) return z.trim();
  }
  return null;
}

type Cfg = NonNullable<CompanyInfo["preguntasAuto"]>;

/** Arma el mensaje final: saludo + texto + cierre (la cortesía lleva solo el saludo). */
export function compose(cfg: Cfg, category: string, body: string): string {
  const parts = [cfg.saludo?.trim(), body.trim(), category === "cortesia" ? "" : cfg.despedida?.trim()].filter(Boolean);
  return parts.join(" ");
}

/** Respuesta lista para enviar, o null si no hay un texto cargado para esta pregunta (o la tiene que contestar una persona). */
export function answerFor(question: string, cfg: Cfg): { category: QuestionCategory; text: string } | null {
  const cats = classifyAll(question);
  if (cats.length !== 1) return null; // sin intención clara o con varios temas mezclados: no se contesta, la ve una persona
  const category = cats[0];
  if (category === "cantidad") return null; // pedidos a medida o por cantidad: los contesta una persona
  const textos = cfg.textos ?? {};
  const zona = category === "envio_zona" || category === "costo_envio" ? zonaEnPregunta(question, cfg.zonasGratis) : null;
  const body = zona && textos.zona_gratis ? textos.zona_gratis.replaceAll("{zona}", zona) : textos[category === "costo_envio" ? "envio_zona" : category];
  if (!body?.trim()) return null;
  return { category, text: compose(cfg, category, body) };
}
