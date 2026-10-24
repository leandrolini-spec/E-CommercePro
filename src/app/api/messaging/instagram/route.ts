import { after } from "next/server";
import { metaSignatureOk, metaVerify } from "@/lib/meta-webhook";
import { addInboxMessage } from "@/modules/inbox";
import { activeProjectId } from "@/modules/repo/supabase";

export const maxDuration = 60;

export const GET = metaVerify;

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Nombre y usuario de quien escribe (si hay un token de Instagram cargado; si no, queda el número de cuenta). */
async function profile(id: string): Promise<{ name: string; username: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!token) return { name: "", username: "" };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=name,username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as R;
    return { name: String(j.name ?? ""), username: String(j.username ?? "") };
  } catch { return { name: "", username: "" }; }
}

// Meta avisa cada mensaje directo que entra a la cuenta profesional de Instagram.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!metaSignatureOk(raw, request.headers.get("x-hub-signature-256"))) return new Response("Firma inválida", { status: 401 });
  const payload = JSON.parse(raw || "{}") as R;
  after(async () => {
    try {
      const projectId = await activeProjectId();
      for (const entry of (payload.entry ?? []) as R[]) for (const ev of (entry.messaging ?? []) as R[]) {
        const from = String(ev.sender?.id ?? "");
        if (!from || from === String(entry.id) || ev.message?.is_echo || !ev.message) continue; // mensajes propios o sin contenido
        const att = ((ev.message.attachments ?? []) as R[]).map((a) => `[${a.type === "image" ? "Imagen" : a.type === "video" ? "Video" : a.type === "audio" ? "Audio" : "Adjunto"}]`).join(" ");
        const body = [String(ev.message.text ?? ""), att].filter(Boolean).join(" ") || "[Mensaje]";
        const p = await profile(from);
        await addInboxMessage(projectId, {
          channel: "instagram", kind: "mensaje", externalId: from, name: p.name || (p.username ? `@${p.username}` : `Instagram ${from.slice(-6)}`),
          handle: p.username ? `@${p.username}` : "", link: p.username ? `https://ig.me/m/${p.username}` : "https://www.instagram.com/direct/inbox/",
        }, { id: String(ev.message.mid ?? `${ev.timestamp}`), direction: "in", body, at: new Date(Number(ev.timestamp) || Date.now()).toISOString() });
      }
    } catch (e) {
      console.error(`[instagram] ${(e as Error).message}`);
    }
  });
  return new Response(null, { status: 200 });
}
