import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

export const ACCESS_COOKIE = "sb-access-token";
export const REFRESH_COOKIE = "sb-refresh-token";

const ONE_WEEK = 60 * 60 * 24 * 7;

/** Cliente solo para operaciones de auth (nunca para leer/escribir datos). */
export function authClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL.trim(), env.SUPABASE_ANON_KEY.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ONE_WEEK,
};

/** Verifica el access token; si venció, intenta renovarlo con el refresh token. */
// Un token ya verificado se da por válido 2 minutos: evita un viaje a Supabase Auth en cada pantalla.
const verified = new Map<string, number>();
const VERIFY_TTL = 120_000;

export async function verifySession(
  accessToken?: string,
  refreshToken?: string,
): Promise<{ ok: boolean; refreshed?: { access_token: string; refresh_token: string } }> {
  const client = authClient();
  if (accessToken) {
    const seen = verified.get(accessToken);
    if (seen && Date.now() - seen < VERIFY_TTL) return { ok: true };
    // getClaims verifica la firma del token con las claves públicas del proyecto (se guardan en memoria): es instantáneo.
    // Si el proyecto usa una clave simétrica, la propia librería consulta al servidor de autenticación, como antes.
    const { data, error } = await client.auth.getClaims(accessToken);
    if (!error && data?.claims) {
      verified.set(accessToken, Date.now());
      if (verified.size > 200) for (const [k, t] of verified) if (Date.now() - t > VERIFY_TTL) verified.delete(k);
      return { ok: true };
    }
  }
  if (!refreshToken) return { ok: false };
  const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return { ok: false };
  return {
    ok: true,
    refreshed: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}

/** Verifica la sesión desde cookies (para route handlers y acciones; el proxy solo hace un chequeo optimista). */
export async function hasValidSession(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1") return true;
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return (await verifySession(store.get(ACCESS_COOKIE)?.value, store.get(REFRESH_COOKIE)?.value)).ok;
}
