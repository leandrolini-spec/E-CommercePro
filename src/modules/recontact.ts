import { hasPhone, looksLikeUser } from "./customers";
import { service } from "./repo/supabase";
import type { Customer, Db } from "./types";

/** Recontacto: clientes cuya última compra fue hace 45 días o más. Los mensajes los manda una persona; el sistema solo arma la lista. */
export const RECONTACT_FROM_DAYS = 45;
export const RECONTACT_TO_DAYS = 150;
const COOLDOWN_DAYS = 30;

export const recontactMessage = (first: string) =>
  `Hola${first ? ` ${first}` : ""}! Pasaron unas semanas desde tu compra en nuestra tienda. ¿Cómo te fue con tu compra? Si querés volver a comprar, escribinos y te contamos qué tenemos disponible. ¡Gracias!`;

export type RecontactRow = { customer: Customer; name: string; first: string; last: string; days: number; product: string };

const phoneKey = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10);
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

/** Clave de "ya se le escribió": recontacto:<cliente>:<AAAA-MM-DD>. */
export async function contactedMap(projectId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await service().from("message_reads").select("key").eq("project_id", projectId).like("key", "recontacto:%").limit(5000);
  for (const r of data ?? []) {
    const [, id, date] = String(r.key).split(":");
    if (id && date && (out.get(id) ?? "") < date) out.set(id, date);
  }
  return out;
}

export function recontactList(db: Db, today: string, contacted: Map<string, string>) {
  const seen = new Set<string>();
  const rows: RecontactRow[] = [];
  let noPhone = 0;
  for (const c of db.customers) {
    const sales = db.sales.filter((s) => s.customerId === c.id && s.status !== "cancelada").sort((a, b) => b.date.localeCompare(a.date));
    if (!sales.length) continue;
    const last = sales[0].date.slice(0, 10);
    const days = daysBetween(last, today);
    if (days < RECONTACT_FROM_DAYS || days > RECONTACT_TO_DAYS) continue;
    const when = contacted.get(c.id);
    if (when && daysBetween(when, today) < COOLDOWN_DAYS) continue;
    if (!hasPhone(c.phone)) { noPhone++; continue; }
    const k = phoneKey(c.phone);
    if (seen.has(k)) continue;
    seen.add(k);
    const real = looksLikeUser(c) ? "" : c.name;
    const product = sales[0].items.map((i) => db.products.find((p) => p.id === i.productId)?.name ?? "").filter(Boolean).join(", ");
    rows.push({ customer: c, name: real || c.nickname || c.name, first: real.split(/\s+/)[0] ?? "", last, days, product });
  }
  rows.sort((a, b) => a.days - b.days);
  return { rows, noPhone };
}
