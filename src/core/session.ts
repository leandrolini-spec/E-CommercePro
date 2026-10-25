import { createClient } from "@supabase/supabase-js";
import { getEnv, isAuthBypassed } from "./env";

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
const verified = new Map<string, { at: number; userId: string }>();
const VERIFY_TTL = 120_000;

/** Lo mínimo del cliente de auth que usa verifySession (permite probarla sin un Supabase real). */
export type AuthLike = Pick<ReturnType<typeof authClient>["auth"], "getClaims" | "refreshSession">;

export async function verifySession(
  accessToken?: string,
  refreshToken?: string,
  auth: AuthLike = authClient().auth,
): Promise<{ ok: boolean; userId?: string; refreshed?: { access_token: string; refresh_token: string } }> {
  if (accessToken) {
    const seen = verified.get(accessToken);
    if (seen && Date.now() - seen.at < VERIFY_TTL) return { ok: true, userId: seen.userId };
    // getClaims verifica la firma del token con las claves públicas del proyecto (se guardan en memoria): es instantáneo.
    // Si el proyecto usa una clave simétrica, la propia librería consulta al servidor de autenticación, como antes.
    const { data, error } = await auth.getClaims(accessToken);
    const userId = data?.claims?.sub;
    if (!error && userId) {
      verified.set(accessToken, { at: Date.now(), userId });
      if (verified.size > 200) for (const [k, v] of verified) if (Date.now() - v.at > VERIFY_TTL) verified.delete(k);
      return { ok: true, userId };
    }
  }
  if (!refreshToken) return { ok: false };
  const { data, error } = await auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return { ok: false };
  return {
    ok: true,
    userId: data.session.user.id,
    refreshed: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  };
}

/** Verifica la sesión desde cookies (para route handlers y acciones; el proxy solo hace un chequeo optimista). */
export async function hasValidSession(): Promise<boolean> {
  if (isAuthBypassed()) return true;
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return (await verifySession(store.get(ACCESS_COOKIE)?.value, store.get(REFRESH_COOKIE)?.value)).ok;
}
