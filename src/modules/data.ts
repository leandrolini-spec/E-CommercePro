// Puerta única de acceso a los datos del negocio. Con SUPABASE_SERVICE_ROLE_KEY usa la base real;
// sin ella, cae al almacén local de archivo (solo desarrollo). Las pantallas no saben cuál se usa.
import { cache } from "react";
import { forget, memo } from "@/lib/memo";
import { getDb as getFileDb, loadDemo as loadFileDemo, nextId as fileNextId, persist as persistFile, resetToImported as resetFile } from "./demo/store";
import { activeProjectId, forgetSnapshot, isSupabase, loadDbSnap, saveDb } from "./repo/supabase";
import type { Db } from "./types";

// En Vercel cada pedido puede caer en una copia distinta del servidor: una memoria propia mostraría datos viejos. Como la base
// está en la misma región, se lee directo. La memoria solo se usa en servidores permanentes (y en desarrollo).
const DB_TTL = process.env.VERCEL ? 0 : 30_000;

// El proyecto se lee una vez cada 30 s (y al instante tras cualquier escritura) en vez de en cada clic.
// Última copia leída por proyecto: persist() guarda esa misma copia (la que la acción acaba de modificar). Sin esto, en Vercel
// (memoria en 0) el guardado volvía a leer la base, guardaba una copia sin cambios y la edición se perdía en silencio.
const lastLoaded = new Map<string, Db>();

const loadCurrent = cache(async (): Promise<Db> => {
  const id = await activeProjectId();
  const db = await memo(`db:${id}`, DB_TTL, () => loadDbSnap(id));
  lastLoaded.set(id, db);
  return db;
});

/** Descarta lo cacheado: se llama cuando algo escribe en la base por fuera de las pantallas (p. ej. la sincronización). */
export async function invalidateDb() {
  if (!isSupabase()) return;
  const id = await activeProjectId().catch(() => null);
  if (id) { forget(`db:${id}`); forgetSnapshot(id); }
}

export async function getDb(): Promise<Db> {
  return isSupabase() ? loadCurrent() : getFileDb();
}

export async function persist(db?: Db): Promise<void> {
  if (!isSupabase()) return persistFile();
  const id = await activeProjectId();
  try {
    await saveDb(id, db ?? lastLoaded.get(id) ?? (await loadCurrent()));
  } catch (e) {
    forget(`db:${id}`); forgetSnapshot(id); // la copia en memoria ya no es confiable
    throw e;
  }
}

export function nextId(prefix: string): string {
  return isSupabase() ? `${prefix}${crypto.randomUUID().slice(0, 8)}` : fileNextId(prefix);
}

export const dataSource = () => (isSupabase() ? "supabase" : "archivo");

export function loadDemo() {
  if (isSupabase()) throw new Error("Los datos DEMO no están disponibles con la base real.");
  loadFileDemo();
}
export function resetToImported() {
  if (isSupabase()) throw new Error("Con la base real no se reimporta desde acá: usá npm run db:import.");
  resetFile();
}
