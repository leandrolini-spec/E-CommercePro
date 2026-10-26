"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { MAX_MSGS, splitMessages } from "@/modules/quick-replies";

/** Caja para responder dentro de la conversación: llama a una acción del servidor y actualiza la pantalla. */
export function ReplyForm({ action, max, label, placeholder, hint, quick, multi = false }: {
  action: (fd: FormData) => Promise<void | { error: string }>; max: number; label: string; placeholder: string; hint?: string; quick?: { title: string; text: string }[];
  /** Mensajes a compradores: se pueden mandar hasta 3 seguidos, separados por una línea "---" (el máximo es por mensaje). */
  multi?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parts = multi ? splitMessages(text) : [text];
  const count = multi ? parts.length : 1;
  const limit = multi ? max * MAX_MSGS + 10 : max;
  const tooLong = multi && (parts.some((m) => m.length > max) || count > MAX_MSGS);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      try {
        const r = await action(fd);
        if (r && typeof r === "object" && "error" in r) { setError(r.error); return; }
        setText("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "No se pudo enviar.");
      }
    });
  }

  return (
    <form action={submit} className="w-full space-y-2">
      {quick && quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Respuestas rápidas">
          {quick.map((q) => (
            <button key={q.title} type="button" title={q.text} onClick={() => setText(q.text.slice(0, limit))} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary">{q.title}</button>
          ))}
        </div>
      )}
      <textarea
        name="text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={limit} required placeholder={placeholder} disabled={pending}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs ${tooLong ? "text-danger" : "text-muted"}`}>{hint ? `${hint} · ` : ""}{multi ? (count > 1 ? `${count} mensajes · hasta ${max} caracteres cada uno` : `${text.length}/${max} · separá con una línea --- para mandar varios`) : `${text.length}/${max}`}</span>
        <Button type="submit" disabled={pending || !text.trim() || tooLong} className="h-8 px-3 py-0 text-xs">{pending ? "Enviando…" : count > 1 ? `${label} (${count})` : label}</Button>
      </div>
      {error && <Alert tone="danger" title={error} />}
    </form>
  );
}
