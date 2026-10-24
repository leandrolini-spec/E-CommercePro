import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica la firma que Tienda Nube manda en x-linkedstore-hmac-sha256 (HMAC-SHA256 del cuerpo con el Client Secret). */
export function tnSignatureOk(body: string, header: string | null): boolean {
  const secret = process.env.TN_CLIENT_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Avisos de privacidad obligatorios: el CRM guarda datos de su propia tienda, así que solo se confirma la recepción. */
export async function handlePrivacyWebhook(request: Request, kind: string): Promise<Response> {
  const body = await request.text();
  if (!tnSignatureOk(body, request.headers.get("x-linkedstore-hmac-sha256"))) {
    return Response.json({ error: "Firma inválida." }, { status: 401 });
  }
  console.log(`[tiendanube] aviso de privacidad: ${kind}`);
  return Response.json({ ok: true });
}
