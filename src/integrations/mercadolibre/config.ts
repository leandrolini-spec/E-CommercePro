import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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

/* ---- Cifrado de tokens en reposo (AES-256-GCM) ---- */
const key = () => createHash("sha256").update(mlEnv().TOKEN_ENC_KEY).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
