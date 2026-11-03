// Datos DEMO de Mercado Libre: publicaciones, preguntas, conversaciones, visitas y reputación, armados a partir de los datos ficticios del CRM.
// Solo se usan en modo demostración (sin base real). Las respuestas que se escriben en la demo quedan en memoria y no salen a ningún lado.
import { isoDaysAgo } from "@/lib/format";
import type { MlData } from "@/integrations/mercadolibre/data";
import { saleTotals, stockOf } from "../calc";
import type { Db } from "../types";

type Item = MlData["items"][number];
type Question = MlData["questions"][number];
type Message = MlData["messages"][number];

type Store = { answers: Map<string, { text: string; at: string }>; replies: Message[] };
const g = globalThis as unknown as { __demoMl?: Store };
const store = (): Store => (g.__demoMl ??= { answers: new Map<string, { text: string; at: string }>(), replies: [] as Message[] });

const SELLER = "900000001";
const iso = (day: number, hour: number, min = 0) => `${isoDaysAgo(day)}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000-03:00`;

/** El vendedor contestó una pregunta desde la pantalla (queda en memoria, solo en la demo). */
export function demoAnswer(questionId: string, text: string) {
  store().answers.set(questionId, { text, at: new Date().toISOString() });
}
/** El vendedor le escribió a un comprador desde la pantalla (queda en memoria, solo en la demo). */
export function demoReply(orderId: string, text: string) {
  const s = store();
  s.replies.push({ id: `demo-r${s.replies.length + 1}`, orderId, fromId: SELLER, text, date: new Date().toISOString(), read: true, fromBuyer: false });
}

const QUESTIONS = [
  "Hola, ¿tienen stock disponible?", "¿Hacen envíos a Córdoba? ¿Cuánto tarda?", "¿Tiene garantía?", "¿Emiten factura A?", "¿Es original?", "¿Puedo retirar por el local?",
  "Buenas, ¿viene en otros colores?", "¿Aceptan transferencia con descuento?", "¿Hacen precio por cantidad? Necesito 10", "¿Llega antes del viernes a Rosario?", "¿Qué medidas tiene?", "¿Se puede pagar en cuotas sin interés?",
];
const ANSWERS = [
  "¡Hola! Sí, tenemos stock disponible. ¡Gracias por escribirnos!", "¡Hola! Hacemos envíos a todo el país. El plazo y el costo los ves al ingresar tu código postal en la publicación. ¡Saludos!",
  "¡Hola! Sí, cuenta con garantía de fábrica. ¡Gracias por consultar!", "¡Hola! Sí, emitimos factura A y B. Indicanos tus datos al comprar. ¡Saludos!", "¡Hola! Sí, es original y nuevo, en caja sellada. ¡Gracias!",
  "¡Hola! Por el momento solo trabajamos con envíos. ¡Gracias por escribirnos!", "¡Hola! Por ahora está disponible solo en el color de la publicación. ¡Saludos!", "¡Hola! El precio publicado ya es el mejor que podemos ofrecer. ¡Gracias!",
  "¡Hola! Para compras por cantidad escribinos y te armamos una propuesta. ¡Saludos!", "¡Hola! Depende de tu zona; con Mercado Envíos ves la fecha estimada antes de comprar. ¡Gracias!",
];

/** Todo lo que muestra la pantalla de Mercado Libre, con el mismo formato que devuelve la integración real. */
export function demoMlData(db: Db): MlData {
  const mlSales = db.sales.filter((s) => s.channel === "Mercado Libre");
  const sellable = db.products.filter((p) => (p.kind ?? "venta") === "venta");

  const soldOf = (pid: string) => mlSales.filter((s) => s.status !== "cancelada").reduce((t, s) => t + s.items.filter((i) => i.productId === pid).reduce((q, i) => q + i.qty, 0), 0);
  const items: Item[] = sellable.map((p, i) => {
    const mlId = `MLA${1450000000 + i * 13711}`;
    const status = i === 6 ? "paused" : i === 13 ? "under_review" : "active";
    const promo = i === 2 || i === 5 || i === 11;
    return {
      id: mlId, title: `${p.name} ${p.brand} - Envío gratis`, status, price: p.price, originalPrice: promo ? Math.round((p.price * 1.18) / 100) * 100 : null,
      available: Math.max(0, stockOf(db, p.id)), sold: soldOf(p.id) + 35 + ((i * 53) % 120), listing: i % 3 === 0 ? "gold_pro" : "gold_special",
      permalink: `https://articulo.mercadolibre.com.ar/${mlId}`, created: isoDaysAgo(150 + i * 9), visits: 220 + ((i * 397) % 1500) + (i < 5 ? 600 : 0), health: 0.72 + ((i * 7) % 26) / 100,
      freeShipping: p.price >= 33000 || i % 2 === 0, productId: p.id, promo: promo ? "Oferta relámpago" : null, ads: i % 4 === 0,
    };
  });

  const buyers = db.customers.filter((c) => c.id.startsWith("mlb_"));
  const buyerNum = (id: string) => id.replace("mlb_", "");

  // Preguntas: unas pocas sin responder (las de hoy y ayer), el resto con su respuesta y el tiempo que se tardó.
  const questions: Question[] = Array.from({ length: 34 }, (_, i) => {
    const day = i < 3 ? 0 : i < 5 ? 1 : i < 6 ? 3 : 1 + Math.floor((i * 29) / 34);
    const created = iso(day, 9 + ((i * 5) % 11), (i * 17) % 60);
    const answered = !(i < 4 || i === 5);
    const hours = 0.4 + ((i * 7) % 90) / 10;
    const item = items[(i * 3 + 1) % items.length];
    const q: Question = {
      id: `1300${100000 + i * 731}`, itemId: item.id, text: QUESTIONS[i % QUESTIONS.length], status: answered ? "ANSWERED" : "UNANSWERED", created,
      answer: answered ? ANSWERS[i % ANSWERS.length] : null, answeredAt: answered ? new Date(new Date(created).getTime() + hours * 3_600_000).toISOString() : null,
      buyerId: buyerNum(buyers[(i * 5) % Math.max(1, buyers.length)]?.id ?? "mlb_1"), hoursToAnswer: answered ? hours : null,
    };
    const mine = store().answers.get(q.id);
    return mine ? { ...q, status: "ANSWERED", answer: mine.text, answeredAt: mine.at, hoursToAnswer: Math.max(0.1, (new Date(mine.at).getTime() - new Date(q.created).getTime()) / 3_600_000) } : q;
  }).sort((a, b) => b.created.localeCompare(a.created));

  // Conversaciones: las compras de los últimos días (la charla vive bajo el número de orden).
  const messages: Message[] = [];
  let k = 0;
  const recent = mlSales.filter((s) => s.mlOrderId && s.status !== "cancelada" && s.date >= isoDaysAgo(12)).sort((a, b) => b.date.localeCompare(a.date));
  recent.forEach((s, idx) => {
    const c = db.customers.find((x) => x.id === s.customerId);
    if (!c) return;
    const day = Math.max(0, Math.round((Date.now() - new Date(`${s.date}T12:00:00`).getTime()) / 86400000));
    const buyer = buyerNum(c.id);
    const add = (fromBuyer: boolean, text: string, h: number, m: number, read = true) => messages.push({ id: `dm${++k}`, orderId: s.mlOrderId!, fromId: fromBuyer ? buyer : SELLER, text, date: iso(day, h, m), read, fromBuyer });
    if (s.welcomed || s.welcomeSentAt) {
      add(false, "¡Gracias por tu compra en nuestra tienda!\n\nPara coordinar la entrega y avisarte cuando salga tu pedido, respondenos por acá completando:\nTeléfono:\nDirección (calle y número):\nLocalidad:", 10, 5);
      if (c.phone && idx % 3 !== 2) {
        add(true, `Hola! Mi teléfono es ${c.phone}, vivo en ${c.address || "Av. Belgrano 1200"}, ${c.city.split(",")[0]}. Gracias!`, 11, 40);
        if (idx % 2 === 0) add(false, "¡Perfecto, gracias! Te avisamos apenas salga tu pedido.", 12, 15);
      }
    } else {
      add(true, idx % 2 === 0 ? "Hola, ¿cuándo me llega mi pedido?" : "Buenas! Hice la compra recién, ¿lo despachan hoy?", 14, 22, false);
    }
  });
  // Algunas consultas de compradores que esperan respuesta.
  messages.push(...store().replies);
  messages.sort((a, b) => b.date.localeCompare(a.date));

  const visitsDaily = Array.from({ length: 30 }, (_, i) => {
    const d = 29 - i;
    const weekend = [0, 6].includes(new Date(`${isoDaysAgo(d)}T12:00:00`).getDay());
    return { date: isoDaysAgo(d), total: Math.round((weekend ? 210 : 290) + ((i * 37) % 90) + i * 2) };
  });

  const counted = mlSales.filter((s) => s.status !== "cancelada");
  void saleTotals;
  return {
    items, questions, messages, visitsDaily, visitsTotal: Math.round(counted.length * 52),
    reputation: { level: "5_green", completed: 1180 + counted.length, canceled: 21, positive: 0.98, claimsRate: 0.008, cancelRate: 0.006, delayedRate: 0.021, points: 4.9 },
  };
}
