import { createHash, randomBytes } from "node:crypto";
import { service } from "@/modules/repo/supabase";
import { authHost, decrypt, encrypt, mlEnv } from "./config";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const b64url = (b: Buffer) => b.toString("base64url");

export type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string; user_id: number };

/** Paso 1: guarda state + code_verifier (PKCE) y devuelve la URL de autorización oficial. */
export async function startAuthorization(projectId: string, site = "MLA"): Promise<string> {
  const env = mlEnv();
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const { error } = await service().from("ml_oauth_states").insert({ state, project_id: projectId, code_verifier: verifier });
  if (error) throw new Error(`No se pudo iniciar la autorización: ${error.message}`);
  const q = new URLSearchParams({
    response_type: "code", client_id: env.ML_CLIENT_ID, redirect_uri: env.redirectUri, state,
    code_challenge: challenge, code_challenge_method: "S256",
  });
  // offline_access es lo que entrega el refresh_token (renovación automática del acceso). Valores permitidos: offline_access, read, write.
  // Los permisos se separan con %20 (no con "+"): así lo espera el estándar OAuth.
  return `${authHost(site)}/authorization?${q}&scope=${encodeURIComponent("offline_access read write")}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error_description || body.error || `HTTP ${res.status}`), { code: body.error, status: res.status });
  // Mercado Libre debe devolver access_token y refresh_token (este último solo con el permiso offline_access).
  const missing = ["access_token", "refresh_token", "expires_in", "user_id"].filter((k) => body[k] === undefined || body[k] === null);
  if (missing.length) {
    const hint = missing.includes("refresh_token") ? " Falta el permiso de acceso sin conexión (offline_access) en la aplicación de Mercado Libre." : "";
    throw new Error(`Mercado Libre no entregó: ${missing.join(", ")}.${hint} Permisos otorgados: ${body.scope ?? "ninguno informado"}.`);
  }
  return body as TokenResponse;
}

/** Paso 2: valida el state (un solo uso, 10 min) y canjea el código por tokens. */
export async function completeAuthorization(code: string, state: string) {
  const env = mlEnv();
  const sb = service();
  const { data, error } = await sb.from("ml_oauth_states").delete().eq("state", state).select("*").single();
  if (error || !data) throw new Error("La autorización no es válida o ya se usó. Probá conectar de nuevo.");
  if (Date.now() - new Date(data.created_at).getTime() > 10 * 60_000) throw new Error("La autorización venció. Probá conectar de nuevo.");
  const t = await tokenRequest({
    grant_type: "authorization_code", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET,
    code, redirect_uri: env.redirectUri, code_verifier: data.code_verifier,
  });
  await saveTokens(data.project_id as string, t);
  return { projectId: data.project_id as string, mlUserId: t.user_id };
}

export async function saveTokens(projectId: string, t: TokenResponse) {
  const { error } = await service().from("ml_accounts").upsert({
    project_id: projectId, ml_user_id: t.user_id, access_token_enc: encrypt(t.access_token), refresh_token_enc: encrypt(t.refresh_token),
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), scope: t.scope ?? null, status: "connected", last_error: null,
    refresh_lock_until: null,
  });
  if (error) throw new Error(`No se pudieron guardar los tokens: ${error.message}`);
}

/**
 * Devuelve un access token vigente. El refresh token es de un solo uso, por eso la renovación
 * se serializa con un bloqueo en la base: si dos procesos renuevan a la vez, uno espera al otro.
 */
export async function getAccessToken(projectId: string, force = false): Promise<{ token: string; mlUserId: number }> {
  const sb = service();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: acc, error } = await sb.from("ml_accounts").select("*").eq("project_id", projectId).single();
    if (error || !acc) throw new Error("Mercado Libre no está conectado.");
    if (acc.status === "revoked") throw new Error("La autorización de Mercado Libre se revocó. Hay que conectar de nuevo.");
    const fresh = new Date(acc.expires_at).getTime() - Date.now() > 5 * 60_000;
    if (fresh && !force) return { token: decrypt(acc.access_token_enc), mlUserId: Number(acc.ml_user_id) };

    // Intenta tomar el bloqueo de renovación (30 s).
    const now = new Date().toISOString();
    const { data: locked } = await sb.from("ml_accounts")
      .update({ refresh_lock_until: new Date(Date.now() + 30_000).toISOString() })
      .eq("project_id", projectId).or(`refresh_lock_until.is.null,refresh_lock_until.lt.${now}`)
      .eq("refresh_token_enc", acc.refresh_token_enc).select("project_id");
    if (!locked?.length) { await new Promise((r) => setTimeout(r, 1500)); force = false; continue; }

    const env = mlEnv();
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET, refresh_token: decrypt(acc.refresh_token_enc) });
      await saveTokens(projectId, t);
      return { token: t.access_token, mlUserId: t.user_id };
    } catch (e) {
      const err = e as Error & { code?: string };
      await sb.from("ml_accounts").update({ refresh_lock_until: null, last_error: err.message, ...(err.code === "invalid_grant" ? { status: "revoked" } : {}) }).eq("project_id", projectId);
      throw err;
    }
  }
  throw new Error("No se pudo renovar el acceso de Mercado Libre. Probá de nuevo en un momento.");
}
