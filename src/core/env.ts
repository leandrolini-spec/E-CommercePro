import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_LOGIN_EMAIL: z.string().email(),
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

/** El bypass solo vale fuera de producción, aunque la variable esté puesta. */
export function isAuthBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_BYPASS_AUTH === "1";
}
