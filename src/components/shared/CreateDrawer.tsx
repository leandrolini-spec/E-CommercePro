"use client";

import { Fragment, useState, useTransition, type ReactNode } from "react";
import { Drawer } from "@/components/ui/overlays";
import { CategoryInput } from "@/components/shared/CategoryInput";
import { DotSelect } from "@/components/shared/DotSelect";
import { Guide, GuideSteps } from "@/components/ui/Guide";
import { Alert, Button, CurrencyInput, DatePicker, Field, Input, Select } from "@/components/ui/primitives";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "currency" | "date" | "select" | "email" | "textarea" | "category" | "guide";
  options?: { value: string; label: string; /** Categoría cuyo color se muestra como puntito en la opción. */ dot?: string }[];
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  /** Sugerencias para un texto libre (p. ej. categorías ya usadas); se puede escribir una nueva. */
  suggestions?: string[];
  maxLength?: number;
  /** Solo para mostrar (p. ej. la pregunta que se está respondiendo). */
  readOnly?: boolean;
  /** Respuestas rápidas: botones que rellenan el cuadro de texto con un clic. */
  quick?: { title: string; text: string }[];
  /** Alto del cuadro de texto, en renglones (por defecto 3 si es solo lectura, 5 si se edita). */
  rows?: number;
  /** Título de grupo que se dibuja antes de este campo. */
  section?: string;
  /** Texto de ayuda debajo del campo. */
  help?: string;
  /** En un desplegable: sin la opción en blanco "Elegir…" (cuando siempre hay una opción válida). */
  noBlank?: boolean;
  /** Ocupa la mitad del ancho (dos campos por renglón). */
  half?: boolean;
  /** Solo se muestra si se cumplen todas estas condiciones sobre otros campos del formulario. */
  showIf?: { field: string; equals?: string; filled?: boolean }[];
};

/** Texto de una guía: los renglones «1) …» pasan a pasos numerados y el resto a párrafos. */
function GuideBody({ text }: { text: string }) {
  const blocks = text.split("\n\n").map((b) => b.split("\n"));
  return (
    <>
      {blocks.map((lines, i) =>
        lines.every((l) => /^\d+\)\s/.test(l))
          ? <GuideSteps key={i} steps={lines.map((l) => l.replace(/^\d+\)\s/, ""))} />
          : <p key={i}>{lines.join(" ")}</p>)}
    </>
  );
}

/** Etiqueta corta en un solo renglón: lo que va entre paréntesis al final pasa a la aclaración chica de abajo. */
const labelOf = (label: string) => {
  const m = label.match(/^(.+?)\s*\((.+)\)\s*$/);
  return m ? { main: m[1], extra: m[2].charAt(0).toUpperCase() + m[2].slice(1) } : { main: label, extra: "" };
};

/** Botón + panel lateral con un formulario genérico que llama a una Server Action. */
export function CreateDrawer({
  buttonLabel, title, fields, action, variant = "primary", extraAction, compact, className, icon, iconOnly,
}: {
  buttonLabel: string; title: string; fields: FieldDef[]; action: (fd: FormData) => Promise<void | { error: string }>; variant?: "primary" | "secondary";
  /** Segundo botón dentro del formulario (p. ej. “Convertir en cliente”): hace lo mismo que Guardar y además otra cosa. */
  extraAction?: { label: string; action: (fd: FormData) => Promise<void | { error: string }> };
  /** Botón chico, para filas de tablas. */
  compact?: boolean;
  className?: string;
  icon?: ReactNode;
  /** Botón cuadrado de 36 px con solo el ícono (el texto queda como ayuda al pasar el mouse). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Cada vez que se abre, el formulario se arma de nuevo con lo que está guardado (si no, quedaría lo que se había escrito antes).
  const [formKey, setFormKey] = useState(0);
  // Valores actuales de los campos (para mostrar u ocultar los que dependen de otros).
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])));
  const visible = (f: FieldDef) => (f.showIf ?? []).every((c) => (c.filled ? Boolean(vals[c.field]) : vals[c.field] === c.equals));

  function run(act: (fd: FormData) => Promise<void | { error: string }>, fd: FormData) {
    setError(null);
    start(async () => {
      try {
        const r = await act(fd);
        if (r && typeof r === "object" && "error" in r) { setError(r.error); return; }
        setOpen(false);
      } catch (e) {
        const m = (e as Error).message || "";
        setError(!m || /#441|Server Components render/.test(m) ? "No se pudo guardar. Revisá los datos e intentá de nuevo." : m);
      }
    });
  }
  const submit = (fd: FormData) => run(action, fd);

  return (
    <>
      <Button variant={variant} title={iconOnly ? buttonLabel : undefined} aria-label={iconOnly ? buttonLabel : undefined} className={`${iconOnly ? (compact ? "h-8 w-8 justify-center px-0! py-0!" : "h-9 w-9 justify-center px-0! py-0!") : compact ? "h-8 gap-1.5 px-2.5 py-0 text-xs" : ""} ${className ?? ""}`} onClick={() => { setError(null); setVals(Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""]))); setFormKey((k) => k + 1); setOpen(true); }}>{icon}{iconOnly ? null : buttonLabel}</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title={title}>
        <form
          key={formKey} action={submit} className="grid grid-cols-2 gap-x-3 gap-y-4"
          onChange={(e) => { const t = e.target as unknown as HTMLInputElement; if (t.name) setVals((v) => ({ ...v, [t.name]: t.value })); }}
        >
          {fields.filter(visible).map((f) => f.type === "guide" ? (
            <div key={f.name} className="col-span-2">
              <Guide title={f.label}><GuideBody text={f.defaultValue ?? ""} /></Guide>
            </div>
          ) : (
            <Fragment key={f.name}>
            {f.section && <h3 className="col-span-2 -mb-1 mt-2 border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{f.section}</h3>}
            <div className={f.half ? "" : "col-span-2"}>
            <Field center label={f.required ? `${labelOf(f.label).main} *` : labelOf(f.label).main}>
              {f.type === "select" && f.options?.some((o) => o.dot !== undefined) ? (
                <DotSelect name={f.name} required={f.required} defaultValue={f.defaultValue} options={f.options} placeholder={f.placeholder ?? "Elegir…"} />
              ) : f.type === "select" ? (
                <Select name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""}>
                  {!f.noBlank && <option value="">Elegir…</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : f.type === "textarea" ? (
                <>
                {f.quick && f.quick.length > 0 && (
                  <div className="mb-2 flex flex-wrap justify-center gap-1.5" aria-label="Respuestas rápidas">
                    {f.quick.map((q) => (
                      <button key={q.title} type="button" title={q.text} onClick={(e) => { const ta = e.currentTarget.closest("label")?.querySelector("textarea"); if (ta) { ta.value = q.text; ta.focus(); } }} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted hover:border-primary hover:text-primary">{q.title}</button>
                    ))}
                  </div>
                )}
                <textarea name={f.name} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} rows={f.rows ?? (f.readOnly ? 3 : 5)} maxLength={f.maxLength} readOnly={f.readOnly} className={`w-full rounded-md border border-line px-3 py-2 ${f.readOnly ? "bg-bg text-muted" : "bg-surface"} text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20`} />
                </>
              ) : f.type === "category" ? (
                <CategoryInput name={f.name} required={f.required} defaultValue={f.defaultValue} suggestions={f.suggestions ?? []} />
              ) : f.type === "currency" ? (
                <CurrencyInput name={f.name} required={f.required} defaultValue={f.defaultValue} />
              ) : f.type === "date" ? (
                <DatePicker name={f.name} required={f.required} defaultValue={f.defaultValue} />
              ) : (
                <Input name={f.name} type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"} step={f.type === "number" ? "any" : undefined} required={f.required} defaultValue={f.defaultValue} placeholder={f.placeholder} readOnly={f.readOnly} className={f.readOnly ? "cursor-not-allowed bg-bg font-medium text-muted" : undefined} list={f.suggestions ? `dl-${f.name}` : undefined} autoComplete={f.suggestions ? "off" : undefined} />
              )}
              {f.suggestions && <datalist id={`dl-${f.name}`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
              {(f.help || labelOf(f.label).extra) && <p className="mt-1 text-center text-xs text-muted">{[labelOf(f.label).extra, f.help].filter(Boolean).join(" · ")}</p>}
            </Field>
            </div>
            </Fragment>
          ))}
          {error && <div className="col-span-2"><Alert tone="danger" title={error} /></div>}
          <div className="col-span-2 flex flex-wrap justify-end gap-2 pt-2 max-md:[&>*]:flex-1">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant={extraAction ? "secondary" : "primary"} disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
            {extraAction && (
              <Button type="button" disabled={pending} onClick={(e) => { const form = e.currentTarget.form; if (form && form.reportValidity()) run(extraAction.action, new FormData(form)); }}>{extraAction.label}</Button>
            )}
          </div>
        </form>
      </Drawer>
    </>
  );
}
