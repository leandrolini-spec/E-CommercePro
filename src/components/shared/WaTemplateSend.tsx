"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendWhatsAppTemplate } from "@/integrations/whatsapp/actions";
import { Alert, Button, Select } from "@/components/ui/primitives";
import { fillTemplate } from "@/modules/whatsapp";

type Tpl = { id: string; name: string; body: string; vars: string[] };

/** Pasadas las 24 horas solo se puede escribir con una plantilla aprobada: se elige una y se ve cómo queda antes de enviarla. */
export function WaTemplateSend({ threadId, customerName, values, templates }: { threadId: string; customerName: string; /** Datos del cliente para completar las variables (nombre, producto, seguimiento…). */ values: Record<string, string>; templates: Tpl[] }) {
  const router = useRouter();
  const [id, setId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const t = templates.find((x) => x.id === id);
  const missing = t ? t.vars.filter((v) => !values[v]) : [];
  const preview = t ? fillTemplate(t.body, t.vars.map((v) => values[v] || `[${v}]`)) : "";

  if (!templates.length) return <p className="text-sm text-muted">No hay plantillas aprobadas todavía. Creá una en la sección WhatsApp → Plantillas.</p>;
  return (
    <form
      className="w-full space-y-2"
      action={(fd) => {
        setError(null); setOk(false);
        start(async () => {
          const r = await sendWhatsAppTemplate(threadId, fd);
          if (r && "error" in r) { setError(r.error); return; }
          setOk(true); router.refresh();
        });
      }}
    >
      <Select name="templateId" value={id} onChange={(e) => setId(e.target.value)} aria-label="Plantilla">
        {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
      <input type="hidden" name="customerName" value={customerName} />
      {preview && <p className="whitespace-pre-wrap rounded-2xl bg-mint/60 px-4 py-3 text-sm text-ink">{preview}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">Se envía como plantilla aprobada por Meta</span>
        <Button type="submit" disabled={pending || !t || missing.length > 0} className="h-8 px-4 py-0 text-xs">{pending ? "Enviando…" : "Enviar plantilla"}</Button>
      </div>
      {missing.length > 0 && <Alert tone="warning" title={`Faltan datos de este cliente: ${missing.map((v) => `[${v}]`).join(", ")}`}>Elegí otra plantilla o cargá el envío o la compra de este cliente.</Alert>}
      {ok && <Alert tone="success" title="Plantilla enviada" />}
      {error && <Alert tone="danger" title={error} />}
    </form>
  );
}
