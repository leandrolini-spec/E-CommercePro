import { getAccessToken } from "./oauth";

const API = "https://api.mercadolibre.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MlError extends Error {
  constructor(message: string, public status: number, public path: string) { super(message); }
}

/**
 * GET autenticado a la API oficial. Reintenta con espera creciente ante 429, 5xx y timeouts,
 * y renueva el token una vez si responde 401. Nunca se llama desde el navegador.
 */
export async function mlGet<T = unknown>(projectId: string, path: string, query?: Record<string, string | number | undefined>, extraHeaders?: Record<string, string>): Promise<T> {
  if (!path.startsWith("/") || path.includes("..") || path.includes("//")) throw new MlError("Ruta no permitida", 400, path);
  const qs = query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) : "";
  let force = false, lastErr: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { token } = await getAccessToken(projectId, force);
      const res = await fetch(`${API}${path}${qs}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json", ...extraHeaders }, signal: AbortSignal.timeout(15000) });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !force) { force = true; continue; }
      if (res.status === 429 || res.status >= 500) { lastErr = new MlError(`HTTP ${res.status}`, res.status, path); await sleep(500 * 2 ** attempt); continue; }
      const body = await res.json().catch(() => ({}));
      throw new MlError(body.message || body.error || `HTTP ${res.status}`, res.status, path);
    } catch (e) {
      if (e instanceof MlError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e as Error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr ?? new MlError("Sin respuesta", 0, path);
}

/**
 * POST autenticado a la API oficial (responder mensajes y preguntas). Un solo intento, sin reintentos automáticos:
 * si se repitiera, el cliente podría recibir el mismo mensaje dos veces. Solo renueva el token una vez si responde 401.
 */
export async function mlPost<T = unknown>(projectId: string, path: string, body: unknown, query?: Record<string, string | number | undefined>, method: "POST" | "PUT" = "POST"): Promise<T> {
  if (!path.startsWith("/") || path.includes("..") || path.includes("//")) throw new MlError("Ruta no permitida", 400, path);
  const qs = query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])) : "";
  let force = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { token } = await getAccessToken(projectId, force);
    const res = await fetch(`${API}${path}${qs}`, {
      method, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401 && !force) { force = true; continue; }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data as T;
    throw new MlError(data.message || data.error || `HTTP ${res.status}`, res.status, path);
  }
  throw new MlError("No autorizado", 401, path);
}
