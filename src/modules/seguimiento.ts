import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Enlace de seguimiento de un pedido: no hace falta guardarlo en la base. Se arma con el id del envío y una firma
 * que solo conoce el servidor, así que cada enlace es único y no se puede adivinar ni armar para otro pedido.
 */
const secret = () => process.env.TOKEN_ENC_KEY ?? process.env.CRON_SECRET ?? "";
const sign = (id: string) => createHmac("sha256", secret()).update(`seguimiento:${id}`).digest("base64url").slice(0, 22);

export const seguimientoToken = (shipmentId: string) => `${Buffer.from(shipmentId).toString("base64url")}.${sign(shipmentId)}`;

/** Devuelve el id del envío si el enlace es válido; si no, null. */
export function shipmentIdFromToken(token: string): string | null {
  const [enc, sig] = token.split(".");
  if (!enc || !sig || !secret()) return null;
  let id = "";
  try { id = Buffer.from(enc, "base64url").toString("utf8"); } catch { return null; }
  const a = Buffer.from(sign(id)), b = Buffer.from(sig);
  return id && a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const seguimientoUrl = (base: string, shipmentId: string) => `${base.replace(/\/$/, "")}/seguimiento/${seguimientoToken(shipmentId)}?v=2`;
