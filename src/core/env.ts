import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  // Solo desarrollo: saltea el login para previsualizar la interfaz sin Supabase.
  DEV_BYPASS_AUTH: z.enum(["0", "1"]).default("0"),
});

export type Env = z.infer<typeof schema>;

/** Devuelve el entorno validado o lanza un error claro con las variables que faltan. */
export function getEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuración incompleta. Revisá .env (ver .env.example): ${missing}`);
  }
  return parsed.data;
}

/** Hay una base Supabase configurada (clave de servicio cargada y sin forzar el modo archivo). */
export const supabaseConfigured = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.DATA_SOURCE !== "file";

/**
 * Modo demostración: sin base Supabase y fuera de producción, la app abre directo con datos de ejemplo (guardados en /data)
 * y sin pantalla de ingreso. En producción nunca se activa: ahí falta configuración y se avisa.
 */
export const isDemoMode = () => process.env.NODE_ENV !== "production" && !supabaseConfigured();

/** Entrar sin iniciar sesión: el modo demostración, o DEV_BYPASS_AUTH=1 en desarrollo. Nunca en producción. */
export function isAuthBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && (isDemoMode() || process.env.DEV_BYPASS_AUTH === "1");
}
