import type { CompanyInfo } from "./types";

/** Reglas de entrega: qué días reparte la logística y en qué horario. Se editan en Configuración → Sistema. */
export type DeliveryRules = { days: number[]; from: string; pickupFrom: string; pickupTo: string; off: string[] };

/** Por defecto: se reparte martes y viernes desde las 13:00, y la logística retira los paquetes de 12:30 a 13:30. */
export const DEFAULT_DELIVERY: DeliveryRules = { days: [2, 5], from: "13:00", pickupFrom: "12:30", pickupTo: "13:30", off: [] };

export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function deliveryRules(c: CompanyInfo | undefined): DeliveryRules {
  const days = (c?.deliveryDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return {
    days: days.length ? [...new Set(days)].sort() : DEFAULT_DELIVERY.days,
    from: c?.deliveryFrom ?? DEFAULT_DELIVERY.from, pickupFrom: c?.pickupFrom ?? DEFAULT_DELIVERY.pickupFrom, pickupTo: c?.pickupTo ?? DEFAULT_DELIVERY.pickupTo,
    off: c?.deliveryOff ?? [],
  };
}

const utc = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fecha de entrega estimada: el primer día de reparto DESPUÉS del día de la compra (salta los días sin reparto).
 * Así viernes a lunes se entrega el martes, y de martes a jueves el viernes. Una compra hecha el mismo día de reparto
 * por la mañana pasa al siguiente: si se llega a empaquetar, se adelanta a mano.
 */
export function estimateDelivery(purchaseDate: string, r: DeliveryRules): string {
  const d = utc(purchaseDate);
  for (let i = 1; i <= 60; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (r.days.includes(d.getUTCDay()) && !r.off.includes(iso(d))) return iso(d);
  }
  return iso(d);
}

/** "martes 21/10" */
export function entregaLabel(date: string): string {
  const d = utc(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "martes y viernes" / "lunes, miércoles y viernes" (en orden de la semana, empezando por el lunes). */
export function diasLabel(r: DeliveryRules): string {
  const names = [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0] ?? "";
}

export const horarioLabel = (r: DeliveryRules) => (r.from ? `a partir de las ${r.from} Hs` : "durante el día");
export const retiroLabel = (r: DeliveryRules) => (r.pickupFrom && r.pickupTo ? `entre las ${r.pickupFrom} y las ${r.pickupTo}` : "");
