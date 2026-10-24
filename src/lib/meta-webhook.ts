import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta firma cada aviso: cabecera x-hub-signature-256 = "sha256=" + HMAC-SHA256 del cuerpo con el secreto de la app. */
export function metaSignatureOk(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verificación inicial del webhook (Meta hace un GET con hub.challenge y el token que elegiste). */
export function metaVerify(request: Request): Response {
  const q = new URL(request.url).searchParams;
  const token = process.env.META_VERIFY_TOKEN?.trim();
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export const metaConfigured = () => Boolean(process.env.META_APP_SECRET?.trim() && process.env.META_VERIFY_TOKEN?.trim());
