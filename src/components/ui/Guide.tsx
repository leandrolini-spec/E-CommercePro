import type { ReactNode } from "react";

/** Explicación plegada: una pregunta con botón; al tocarlo se despliega el texto. Sirve en páginas del servidor y dentro de formularios. */
export function Guide({ title = "¿Querés saber cómo funciona?", children, className = "", tone = "info" }: { title?: string; children: ReactNode; className?: string; /** "warning" marca el botón con «!» en naranja para avisos que conviene mirar. */ tone?: "info" | "warning" }) {
  return (
    <details className={`group rounded-lg border border-line bg-surface open:bg-bg/60 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-ink hover:bg-bg [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${tone === "warning" ? "bg-warning" : "bg-primary"}`}>{tone === "warning" ? "!" : "?"}</span>
          {title}
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
      </summary>
      <div className="space-y-2 border-t border-line px-4 py-3 text-sm leading-relaxed text-muted [&_strong]:text-ink">{children}</div>
    </details>
  );
}

/** Pasos numerados para dentro de una guía. */
export function GuideSteps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line bg-surface text-[11px] font-semibold text-ink">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}
