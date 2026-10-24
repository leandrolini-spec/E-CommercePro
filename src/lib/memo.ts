// Caché en memoria del servidor (una sola instancia): evita repetir viajes a la base en cada clic.
type Entry = { at: number; value: unknown };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>; // pedidos simultáneos comparten la misma consulta
  const p = fn().then((value) => { store.set(key, { at: Date.now(), value }); return value; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Olvida las entradas cuya clave empieza con el prefijo (se usa cuando se escribe en la base). */
export function forget(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
