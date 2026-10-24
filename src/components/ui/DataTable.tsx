import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "./primitives";

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

/** Tabla presentacional. Búsqueda, orden y paginación se resuelven en el servidor y se pasan como props. */
export function DataTable<T>({
  columns, rows, rowKey, emptyTitle = "Sin resultados", emptyDescription, rowClass, rowStyle, compact = false,
}: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; emptyTitle?: string; emptyDescription?: string; rowClass?: (row: T) => string | undefined; rowStyle?: (row: T) => CSSProperties | undefined;
  /** Tipografía y espaciados más chicos, para tablas con muchas columnas que tienen que entrar en pantalla sin desplazarse. */
  compact?: boolean;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  const isEmpty = (n: ReactNode) => n === null || n === undefined || n === false || n === "";
  const labeled = columns.filter((c) => typeof c.header === "string" && c.header.trim());
  const extras = columns.filter((c) => !(typeof c.header === "string" && c.header.trim()));
  return (
    <>
    {/* Celular: cada fila es una tarjeta (la primera columna es el título, las demás van con su etiqueta, las acciones al final). */}
    <div className="space-y-2.5 md:hidden">
      {rows.map((row) => (
        <div key={rowKey(row)} className="rounded-lg border border-line bg-surface p-3.5 text-sm [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal [&_.whitespace-nowrap:not(.rounded-full)]:whitespace-normal [&_[class*=min-w-]]:min-w-0 [&_[class*=max-w-]:not(.rounded-full)]:max-w-full [&_*]:break-words" style={rowStyle?.(row)}>
          {labeled.map((c, i) => {
            const v = c.render(row);
            if (isEmpty(v)) return null;
            return i === 0 ? (
              <div key={c.key} className="mb-2 min-w-0 text-center text-base font-semibold [&>*]:min-w-0 [&>*]:max-w-full">{v}</div>
            ) : (
              <div key={c.key} className="flex items-start justify-between gap-3 border-t border-line/60 py-1.5 first:border-t-0 [&:has(>div>*:only-child:empty)]:hidden">
                <span className="shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{c.header}</span>
                <div className="min-w-0 text-right [&>*]:min-w-0 [&>*]:max-w-full">{v}</div>
              </div>
            );
          })}
          {extras.some((c) => !isEmpty(c.render(row))) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-2.5">
              {extras.map((c) => { const v = c.render(row); return isEmpty(v) ? null : <div key={c.key}>{v}</div>; })}
            </div>
          )}
        </div>
      ))}
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
      <table className={compact ? "w-full text-xs" : "w-full text-sm"}>
        <thead className={`border-b border-line bg-bg uppercase tracking-wide text-muted ${compact ? "text-[10px]" : "text-xs"}`}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${compact ? "px-2.5 py-2" : "px-4 py-2.5"} align-middle font-medium leading-tight ${c.align === "right" ? "text-right" : c.align === "center" ? (compact ? "text-center" : "min-w-24 text-center") : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={rowClass?.(row) ?? "hover:bg-bg"} style={rowStyle?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={`${compact ? "px-2.5 py-2" : "px-4 py-2.5"} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
