import { after } from "next/server";
import { metaSignatureOk, metaVerify } from "@/lib/meta-webhook";
import { addInboxMessage, customerByPhone } from "@/modules/inbox";
import { activeProjectId } from "@/modules/repo/supabase";

export const maxDuration = 60;

export const GET = metaVerify;

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Texto de un mensaje de WhatsApp (los que no son texto se resumen). */
function bodyOf(m: R): string {
  switch (m.type) {
    case "text": return String(m.text?.body ?? "");
    case "image": return `[Imagen]${m.image?.caption ? ` ${m.image.caption}` : ""}`;
    case "video": return `[Video]${m.video?.caption ? ` ${m.video.caption}` : ""}`;
    case "document": return `[Documento]${m.document?.filename ? ` ${m.document.filename}` : ""}`;
    case "audio": return "[Audio]";
    case "sticker": return "[Sticker]";
    case "location": return "[Ubicación]";
    case "button": return String(m.button?.text ?? "[Botón]");
    case "interactive": return String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[Respuesta]");
    default: return `[${m.type ?? "mensaje"}]`;
  }
}

// Meta avisa cada mensaje que entra al número de WhatsApp Business. Se responde 200 enseguida y se guarda en segundo plano.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!metaSignatureOk(raw, request.headers.get("x-hub-signature-256"))) return new Response("Firma inválida", { status: 401 });
  const payload = JSON.parse(raw || "{}") as R;
  after(async () => {
    try {
      const projectId = await activeProjectId();
      for (const entry of (payload.entry ?? []) as R[]) for (const ch of (entry.changes ?? []) as R[]) {
        const v = (ch.value ?? {}) as R;
        const names = new Map(((v.contacts ?? []) as R[]).map((c) => [String(c.wa_id), String(c.profile?.name ?? "")]));
        for (const m of (v.messages ?? []) as R[]) {
          const phone = String(m.from ?? "");
          if (!phone) continue;
          await addInboxMessage(projectId, {
            channel: "whatsapp", kind: "mensaje", externalId: phone, name: names.get(phone) || `+${phone}`, phone: `+${phone}`, link: `https://wa.me/${phone}`,
            customerId: await customerByPhone(projectId, phone),
          }, { id: String(m.id), direction: "in", body: bodyOf(m), at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString() });
        }
      }
    } catch (e) {
      console.error(`[whatsapp] ${(e as Error).message}`);
    }
  });
  return new Response(null, { status: 200 });
}
