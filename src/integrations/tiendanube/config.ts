import { z } from "zod";

const schema = z.object({
  TN_CLIENT_ID: z.string().min(1),
  TN_CLIENT_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  TOKEN_ENC_KEY: z.string().min(32),
});

/** Variables de la integración. Lanza un error claro con lo que falta (nunca expone valores). */
export function tnEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Falta configurar Tienda Nube: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return parsed.data;
}

export const tnConfigured = () => schema.safeParse(process.env).success;

/** Nombres (nunca valores) de las variables que faltan. */
export const tnMissing = () => {
  const r = schema.safeParse(process.env);
  return r.success ? [] : [...new Set(r.error.issues.map((i) => String(i.path[0])))];
};

export const TN_API = "https://api.tiendanube.com/v1";
export const TN_USER_AGENT = "CRM (contacto@example.com)";
