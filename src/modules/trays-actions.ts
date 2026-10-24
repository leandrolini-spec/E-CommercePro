"use server";

import { revalidatePath } from "next/cache";
import { getDb, persist } from "./data";
import { DEFAULT_PLAN } from "./trays";
import { TRAY_COMPOSITION } from "./grower";
import { today } from "@/lib/format";

/** Capacidad semanal del productor y margen de seguridad del pedido. */
export async function saveTrayPlan(fd: FormData): Promise<void | { error: string }> {
  const capacity = Math.round(Number(fd.get("capacity")));
  const buffer = Math.round(Number(fd.get("buffer")));
  if (!(capacity > 0 && capacity <= 1000)) return { error: "La capacidad semanal tiene que ser un número mayor a cero." };
  if (!(buffer >= 0 && buffer <= 100)) return { error: "El margen de seguridad va de 0 a 100 %." };
  const db = await getDb();
  const company = (db.settings.company ??= {});
  company.trayPlan = { ...DEFAULT_PLAN, ...(company.trayPlan ?? {}), capacity, buffer };
  await persist(db);
  revalidatePath("/abastecimiento");
}

/** Conteo de packs en mano (después de un retiro): desde esa fecha el sistema va restando lo que se vende. */
export async function registerPickup(fd: FormData): Promise<void | { error: string }> {
  const counts: Record<string, number> = {};
  for (const t of TRAY_COMPOSITION) {
    const v = Math.round(Number(fd.get(`q_${t.key}`) || 0));
    if (!(v >= 0 && v <= 2000)) return { error: `Revisá la cantidad de "${t.name}".` };
    counts[t.key] = v;
  }
  const raw = String(fd.get("date") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today();
  const db = await getDb();
  const company = (db.settings.company ??= {});
  company.trayPlan = { ...DEFAULT_PLAN, ...(company.trayPlan ?? {}), stock: { date, counts } };
  await persist(db);
  revalidatePath("/abastecimiento");
}
