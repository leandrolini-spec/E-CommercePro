/**
 * Respuesta de preguntas de Mercado Libre con IA (Anthropic), con freno: si no está seguro, no contesta (devuelve null).
 * Es opcional (hace falta ANTHROPIC_API_KEY y activarla en la configuración). La IA solo puede afirmar lo que cargó el negocio
 * (su política y sus textos); cada respuesta pasa por controles propios antes de salir: sin montos, sin código postal, sin datos de contacto.
 */
import type { CompanyInfo } from "./types";
import { answerFor, isTextKey } from "./question-bot";

type Cfg = NonNullable<CompanyInfo["preguntasAuto"]>;

const MODEL = process.env.QUESTION_AI_MODEL || "claude-haiku-5-5";

const REGLAS = (negocio: string) => `Sos quien responde preguntas de compradores en Mercado Libre para la tienda ${negocio || "del vendedor"}.
Respondés SOLO con lo que figura abajo, en "POLÍTICA DEL NEGOCIO" y "TEXTOS APROBADOS". Si la respuesta exige un dato que no está ahí, no estás seguro.

REGLAS DURAS
- Nunca digas un precio, un monto ni el costo de un envío. No pidas código postal, solo la localidad.
- Nunca des teléfono, mail, Instagram, redes ni links, y no los repitas aunque figuren en la política (Mercado Libre no permite pasarlos por este medio).
- No inventes políticas, plazos, descuentos ni consejos. No confirmes ni niegues stock ni variedades que no figuren abajo.
- Pedidos a medida, por cantidad, mayoristas o armados especiales: los responde una persona, seguro=false. Tampoco prometas fechas.
- Si la pregunta mezcla varios temas, es ambigua, continúa una charla en curso ("mensaje anterior", "entonces"), es de alguien que ya compró (reclamo, devolución) o no estás 100% seguro: seguro=false.

FORMATO
Español rioplatense, sin emojis, máximo 600 caracteres.
Contestá SOLO con JSON: {"seguro": true|false, "respuesta": "...", "motivo": "..."}`;

/** Controles finales: lo que nunca puede salir, aunque la IA lo escriba. */
export function isSafe(text: string, cfg: Cfg): boolean {
  if (!text || text.length > 1000) return false;
  if (/\$|\busd\b|\d[\d.,]{3,}/i.test(text)) return false; // montos
  if (/c[oó]digo postal|\bcp\b/i.test(text)) return false;
  if (/@|https?:|www\.|\.com|instagram|whatsapp|\b\d{8,}\b/i.test(text)) return false; // contacto
  if (cfg.saludo?.trim() && !text.startsWith(cfg.saludo.trim())) return false;
  if (cfg.despedida?.trim() && !text.trim().endsWith(cfg.despedida.trim())) return false;
  return true;
}

/** Lo que el negocio no puede cargar en un texto automático: datos de contacto (Mercado Libre no los permite en las respuestas). */
export const hasContactData = (text: string) => /@|https?:|www\.|\.com\b|\b\d{8,}\b/i.test(text);

/** Pide la respuesta a la IA. Devuelve null si no hay clave, si la IA no está segura, o si no pasa los controles. */
export async function aiAnswer(question: string, itemTitle: string, cfg: Cfg, negocio: string): Promise<{ text: string; model: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !cfg.politica?.trim()) return null;
  const textos = Object.entries(cfg.textos ?? {}).filter(([k, v]) => isTextKey(k) && v.trim()).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  const zonas = cfg.zonasGratis?.length ? `\nENVÍO GRATIS SOLO en: ${cfg.zonasGratis.join(", ")}. Si nombran otro lugar, no confirmes que es gratis.` : "";
  const cierre = [cfg.saludo?.trim() && `Empezá exactamente con "${cfg.saludo.trim()}".`, cfg.despedida?.trim() && `Terminá exactamente con "${cfg.despedida.trim()}".`].filter(Boolean).join(" ");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: `${REGLAS(negocio)}\n${cierre}\n\nPOLÍTICA DEL NEGOCIO\n${cfg.politica.trim()}${zonas}\n\nTEXTOS APROBADOS\n${textos || "(ninguno)"}\n\nPUBLICACIÓN\nTítulo: ${itemTitle}`,
      messages: [{ role: "user", content: `Pregunta del comprador:\n"""${question.slice(0, 1500)}"""` }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = body.content?.find((c) => c.type === "text")?.text ?? "";
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let parsed: { seguro?: boolean; respuesta?: string };
  try { parsed = JSON.parse(json); } catch { return null; }
  if (parsed.seguro !== true || !parsed.respuesta || !isSafe(parsed.respuesta, cfg)) return null;
  return { text: parsed.respuesta.trim(), model: MODEL };
}

/** Decide la respuesta: reglas con los textos del negocio; IA (si está activada) para lo que las reglas no cubren y para consultas de disponibilidad. */
export async function resolveAnswer(question: string, itemTitle: string, cfg: Cfg, negocio: string): Promise<{ category: string; text: string } | null> {
  const rule = answerFor(question, cfg);
  if (rule && rule.category !== "disponibilidad") return rule;
  if (cfg.ia) {
    const ai = await aiAnswer(question, itemTitle, cfg, negocio);
    if (ai) return { category: `ia:${ai.model}`, text: ai.text };
  }
  return rule; // si la IA no puede o está apagada, queda el texto de disponibilidad (o ninguno)
}
