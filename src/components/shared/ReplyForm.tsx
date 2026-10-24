"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui/primitives";

/** Caja para responder dentro de la conversación: llama a una acción del servidor y actualiza la pantalla. */
export function ReplyForm({ action, max, label, placeholder, hint, quick }: {
  action: (fd: FormData) => Promise<void | { error: string }>; max: number; label: string; placeholder: string; hint?: string; quick?: { title: string; text: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
            <button key={q.title} type="button" title={q.text} onClick={() => setText(q.text.slice(0, max))} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary">{q.title}</button>
          ))}
        </div>
      )}
      <textarea
        name="text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={max} required placeholder={placeholder} disabled={pending}
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{hint ? `${hint} · ` : ""}{text.length}/{max}</span>
        <Button type="submit" disabled={pending || !text.trim()} className="h-8 px-3 py-0 text-xs">{pending ? "Enviando…" : label}</Button>
      </div>
      {error && <Alert tone="danger" title={error} />}
    </form>
  );
}
