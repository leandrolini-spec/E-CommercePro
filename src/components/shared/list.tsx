/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoSubmit } from "@/components/shared/AutoSubmit";
import { Button, DatePicker, Input, Select } from "@/components/ui/primitives";

/** `logo` reemplaza al texto del título (el texto queda como descripción accesible). `height` es el alto del logo en píxeles. */
export function PageHeader({ title, subtitle, actions, logo, banner }: { title: string; subtitle?: string; actions?: ReactNode; logo?: { src: string; height: number }; banner?: { background: string; color: string; sub: string } }) {
  return (
    <header className={banner ? "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4 shadow-sm max-md:flex-col max-md:text-center" : "mb-6 flex flex-wrap items-start justify-between gap-3 max-md:flex-col max-md:items-center max-md:text-center"} style={banner ? { background: banner.background, color: banner.color } : undefined}>
      <div>
        {logo ? (
          <h1 className="flex min-h-8 items-center max-md:justify-center"><img src={logo.src} alt={title} style={{ height: logo.height }} className="block w-auto" /></h1>
        ) : (
          <h1 className="text-2xl font-semibold">{title}</h1>
        )}
        {subtitle && <p className="mt-0.5 text-sm text-muted" style={banner ? { color: banner.sub } : undefined}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>*]:min-w-[calc(50%-0.25rem)] max-md:[&>*]:flex-1 max-md:[&_a]:h-11 max-md:[&_a]:justify-center max-md:[&_a]:px-2 max-md:[&_a]:text-[13px] max-md:[&_a]:w-full max-md:[&_a]:whitespace-normal max-md:[&_a]:text-center max-md:[&_a]:leading-tight max-md:[&_button]:h-11 max-md:[&_button]:justify-center max-md:[&_button]:px-2 max-md:[&_button]:text-[13px] max-md:[&_button]:w-full max-md:[&_button]:whitespace-normal max-md:[&_button]:leading-tight" style={banner ? { color: "var(--color-ink)" } : undefined}>{actions}</div>}
    </header>
  );
}

export type SearchParams = Record<string, string | string[] | undefined>;
export const param = (sp: SearchParams, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

/** Barra de búsqueda y filtros (GET): el filtrado se resuelve en el servidor. */
export function Filters({
  sp, searchPlaceholder = "Buscar…", filters = [], dates = false,
}: {
  sp: SearchParams; searchPlaceholder?: string; dates?: boolean; filters?: { name: string; label: string; /** Texto de la opción vacía (por defecto "Etiqueta: todos"). */ allLabel?: string; options: string[] | { value: string; label: string }[] }[];
}) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2 max-md:justify-center">
      {/* Se conservan los demás parámetros de la pantalla (solapa, día, tipo…) al filtrar. */}
      {Object.entries(sp).filter(([k, v]) => v && !["q", "page", "from", "to", ...filters.map((f) => f.name)].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={Array.isArray(v) ? v[0] : v} />)}
      <div className="w-full min-w-0 sm:w-auto sm:min-w-48 sm:flex-1">
        <Input name="q" defaultValue={param(sp, "q")} placeholder={searchPlaceholder} aria-label="Buscar" />
      </div>
      {filters.map((f) => (
        <div key={f.name} className="w-[calc(50%-0.25rem)] min-w-0 sm:w-44">
          <Select name={f.name} defaultValue={param(sp, f.name)} aria-label={f.label}>
            <option value="">{f.allLabel ?? `${f.label}: todos`}</option>
            {f.options.map((o) => {
              const opt = typeof o === "string" ? { value: o, label: o } : o;
              return <option key={opt.value} value={opt.value}>{opt.label}</option>;
            })}
          </Select>
        </div>
      ))}
      {dates && (
        <div className="grid w-full grid-cols-2 gap-2 sm:contents">
          <label className="min-w-0 text-center text-xs text-muted sm:w-40 sm:text-left">Desde<DatePicker name="from" defaultValue={param(sp, "from")} aria-label="Desde" /></label>
          <label className="min-w-0 text-center text-xs text-muted sm:w-40 sm:text-left">Hasta<DatePicker name="to" defaultValue={param(sp, "to")} aria-label="Hasta" /></label>
        </div>
      )}
      <AutoSubmit />
      <Button type="submit" variant="secondary">Filtrar</Button>
      <Link href={`?${new URLSearchParams(["tab", "g"].flatMap((k) => (param(sp, k) ? [[k, param(sp, k)]] : []))).toString()}`} className="px-2 py-2 text-sm text-muted hover:text-ink">Limpiar</Link>
    </form>
  );
}

export const matches = (q: string, ...fields: (string | number | undefined)[]) =>
  !q || fields.some((f) => String(f ?? "").toLowerCase().includes(q.toLowerCase()));

export const PAGE_SIZE = 10;
export function paginate<T>(rows: T[], sp: SearchParams, size = PAGE_SIZE) {
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  return { rows: rows.slice((page - 1) * size, page * size), page, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / size)) };
}

export function Pager({ sp, page, pages, total }: { sp: SearchParams; page: number; pages: number; total: number }) {
  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && v) u.set(k, Array.isArray(v) ? v[0] : v);
    u.set("page", String(p));
    return `?${u}`;
  };
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted md:justify-between">
      <span>{total} resultado{total === 1 ? "" : "s"}</span>
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {page > 1 ? <Link href={href(page - 1)} className="text-primary">← Anterior</Link> : <span />}
          <span>Página {page} de {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="text-primary">Siguiente →</Link> : <span />}
        </div>
      )}
    </div>
  );
}

/** Botón que ejecuta una Server Action con argumentos ya enlazados. */
export function ActionButton({ action, label, variant = "secondary", tall = false, block = false, icon, iconOnly = false, small = false }: {
  action: () => Promise<void>; label: string; variant?: "primary" | "secondary" | "danger";
  /** Alto de 36 px (botones principales de una tarjeta). `block` lo estira a todo el ancho disponible. */
  tall?: boolean; block?: boolean; icon?: ReactNode; iconOnly?: boolean; /** Con iconOnly: 32 px en lugar de 36. */ small?: boolean;
}) {
  const size = iconOnly ? (small ? "h-8 w-8 justify-center px-0 py-0" : "h-9 w-9 justify-center px-0 py-0") : tall ? `h-9 justify-center gap-2 px-3.5 py-0 text-sm ${block ? "w-full" : ""}` : "h-8 px-2.5 py-0 text-xs";
  return (
    <form action={action} className={block ? "min-w-0 flex-1" : undefined}>
      <Button type="submit" variant={variant} title={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} className={size}>{icon}{iconOnly ? null : label}</Button>
    </form>
  );
}
