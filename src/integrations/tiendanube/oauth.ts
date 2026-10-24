import { randomBytes } from "node:crypto";
import { service } from "@/modules/repo/supabase";
import { decrypt, encrypt } from "@/integrations/mercadolibre/config";
import { TN_API, TN_USER_AGENT, tnEnv } from "./config";

/** Paso 1: guarda un state de un solo uso y devuelve la URL de autorización de Tienda Nube. */
export async function startAuthorization(projectId: string): Promise<string> {
  const env = tnEnv();
  const state = randomBytes(24).toString("base64url");
  const { error } = await service().from("tn_oauth_states").insert({ state, project_id: projectId });
  if (error) throw new Error(`No se pudo iniciar la autorización: ${error.message}`);
  return `https://www.tiendanube.com/apps/${env.TN_CLIENT_ID}/authorize?state=${state}`;
}

/** Paso 2: valida el state (un solo uso, 10 min), canjea el código por el token (no vence) y lo guarda cifrado. */
export async function completeAuthorization(code: string, state: string) {
  const env = tnEnv();
  const sb = service();
  const { data, error } = await sb.from("tn_oauth_states").delete().eq("state", state).select("*").single();
  if (error || !data) throw new Error("La autorización no es válida o ya se usó. Probá conectar de nuevo.");
  if (Date.now() - new Date(data.created_at).getTime() > 10 * 60_000) throw new Error("La autorización venció. Probá conectar de nuevo.");

  const res = await fetch("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": TN_USER_AGENT },
    body: JSON.stringify({ client_id: env.TN_CLIENT_ID, client_secret: env.TN_CLIENT_SECRET, grant_type: "authorization_code", code }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token || !body.user_id) {
    throw new Error(body.error_description || body.error || `Tienda Nube no entregó el acceso (HTTP ${res.status}).`);
  }
  const projectId = data.project_id as string;
  const store = await fetch(`${TN_API}/${body.user_id}/store`, {
    headers: { authentication: `bearer ${body.access_token}`, "user-agent": TN_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { name?: Record<string, string> | string } | null;
  const storeName = typeof store?.name === "string" ? store.name : store?.name?.es ?? Object.values(store?.name ?? {})[0] ?? null;

  const { error: saveErr } = await sb.from("tn_accounts").upsert({
    project_id: projectId, store_id: body.user_id, store_name: storeName, access_token_enc: encrypt(body.access_token),
    scope: body.scope ?? null, status: "connected", last_error: null, connected_at: new Date().toISOString(),
  });
  if (saveErr) throw new Error(`No se pudo guardar la conexión: ${saveErr.message}`);
  return { projectId, storeId: Number(body.user_id) };
}

export async function getTnAccount(projectId: string) {
  const { data } = await service().from("tn_accounts").select("*").eq("project_id", projectId).maybeSingle();
  return data ? { storeId: Number(data.store_id), storeName: data.store_name as string | null, scope: data.scope as string | null, status: data.status as string, connectedAt: data.connected_at as string, token: decrypt(data.access_token_enc) } : null;
}
