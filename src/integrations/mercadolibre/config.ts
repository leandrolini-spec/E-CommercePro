import { z } from "zod";

const schema = z.object({
  ML_CLIENT_ID: z.string().min(1),
  ML_CLIENT_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  TOKEN_ENC_KEY: z.string().min(32),
});

/** Variables de la integración. Lanza un error claro con lo que falta (nunca expone valores). */
export function mlEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Falta configurar Mercado Libre: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const env = parsed.data;
  return { ...env, redirectUri: `${env.APP_BASE_URL.replace(/\/$/, "")}/api/integrations/mercadolibre/callback` };
}

export const mlConfigured = () => schema.safeParse(process.env).success;

/** Nombres (nunca valores) de las variables que faltan o no son válidas. */
export function mlMissing(): string[] {
  const r = schema.safeParse(process.env);
  return r.success ? [] : [...new Set(r.error.issues.map((i) => `${i.path.join(".")}${i.code === "too_small" && i.path[0] === "TOKEN_ENC_KEY" ? " (muy corta, mínimo 32 caracteres)" : ""}`))];
}

// Dominio de autorización por sitio (el sitio es configuración del proyecto, no se fija en el código).
const AUTH_HOST: Record<string, string> = {
  MLA: "com.ar", MLB: "com.br", MLM: "com.mx", MLC: "cl", MLU: "com.uy", MCO: "com.co", MPE: "com.pe",
};
export const authHost = (site: string) => `https://auth.mercadolibre.${AUTH_HOST[site] ?? "com.ar"}`;

/* ---- Cifrado de tokens en reposo: vive en src/core/crypto.ts (lo usan todas las integraciones) ---- */
export { encrypt, decrypt } from "@/core/crypto";
