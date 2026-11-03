import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Cifrado de tokens en reposo (AES-256-GCM) con la clave TOKEN_ENC_KEY. Lo usan Mercado Libre, Tienda Nube, WhatsApp y Meta. */
const key = () => {
  const k = process.env.TOKEN_ENC_KEY;
  if (!k || k.length < 32) throw new Error("Falta TOKEN_ENC_KEY (mínimo 32 caracteres) para guardar las claves de las integraciones.");
  return createHash("sha256").update(k).digest();
};

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
