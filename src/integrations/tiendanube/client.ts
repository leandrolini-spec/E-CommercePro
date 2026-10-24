import { TN_API, TN_USER_AGENT } from "./config";
import { getTnAccount } from "./oauth";

/** GET de solo lectura a la API de Tienda Nube. Devuelve el JSON y la cantidad total si la API la informa. */
export async function tnGet<T>(projectId: string, path: string): Promise<T> {
  const acc = await getTnAccount(projectId);
  if (!acc) throw new Error("Tienda Nube no está conectada.");
  const res = await fetch(`${TN_API}/${acc.storeId}${path}`, {
    headers: { authentication: `bearer ${acc.token}`, "user-agent": TN_USER_AGENT },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Tienda Nube respondió ${res.status} en ${path}`);
  return (await res.json()) as T;
}
