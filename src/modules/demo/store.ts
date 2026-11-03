// Datos DEMO en memoria. Se reemplazan por la base real (Supabase) sin cambiar las pantallas:
// las pantallas leen siempre a través de getDb() y las mutaciones pasan por actions.ts.
import type { Db } from "../types";
import { seed } from "./seed";

import fs from "node:fs";
import path from "node:path";

// Persistencia provisoria en archivo (solo desarrollo local) hasta tener Supabase.
// data/store.json = datos de trabajo · data/seed.json = importación inicial.
const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "store.json");
const SEED = path.join(DATA_DIR, "seed.json");

function readJson(file: string): Db | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Db;
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __db?: Db };
export function getDb(): Db {
  return (g.__db ??= readJson(STORE) ?? readJson(SEED) ?? seed());
}
export function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(getDb()));
  } catch {
    // En producción el disco es de solo lectura: los datos reales irán a Supabase.
  }
}
export function nextId(prefix: string): string {
  const db = getDb();
  return `${prefix}${db.nextId++}`;
}
/** Vuelve a los datos importados del negocio (o al demo si no hay importación). */
export function resetToImported() {
  g.__db = readJson(SEED) ?? seed();
  persist();
}
export function loadDemo() {
  g.__db = seed();
  persist();
}
