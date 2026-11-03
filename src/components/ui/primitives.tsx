import { AnimatedValue } from "./AnimatedValue";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  // El relleno por defecto solo va si quien usa el botón no define el suyo (los botones de solo ícono usan px-0 y quedan redondos).
  const padX = /(^|\s)px-/.test(className ?? "") ? "" : "px-5";
  const padY = /(^|\s)py-/.test(className ?? "") ? "" : "py-2";
  const styles = {
    primary: "bg-accent text-ink shadow-green hover:-translate-y-px hover:bg-[#3fd496] active:translate-y-0",
    secondary: "border border-line bg-surface text-ink shadow-soft hover:-translate-y-px hover:border-accent/50 hover:bg-mint",
    danger: "bg-danger text-white shadow-soft hover:-translate-y-px hover:opacity-90",
    ghost: "text-muted hover:bg-mint hover:text-ink",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0",
        padX,
        padY,
        styles,
        className,
      )}
    />
  );
}

/* ---------- Field wrapper + Input / Select / CurrencyInput / DatePicker ---------- */
export function Field({ label, error, children, center = false }: { label: string; error?: string; children: ReactNode; center?: boolean }) {
  return (
    <label className="block text-sm">
      <span className={`mb-1.5 block pl-1 font-medium text-ink ${center ? "text-center" : ""}`}>{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-full border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, className)}>
      {children}
    </select>
  );
}

export function CurrencyInput({
  currency = "ARS",
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { currency?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-muted">
        {currency}
      </span>
      <input {...props} type="number" step="any" min="0" className={cx(inputCls, "pl-12 text-right", className)} />
    </div>
  );
}

export function DatePicker({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input {...props} type="date" className={cx(inputCls, className)} />;
}

/* ---------- Badge / Alert ---------- */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const toneCls: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-line text-muted",
};

/** `fixed` = todos del mismo tamaño (ancho 7 rem); `"wide"` para textos largos como "Esperando al comprador" (11 rem). */
export function Badge({ tone = "neutral", children, fixed = false }: { tone?: Tone; children: ReactNode; fixed?: boolean | "wide" }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full text-xs font-medium tabular-nums", fixed ? `h-6 ${fixed === "wide" ? "w-44" : "w-28"} justify-center px-2` : "px-2.5 py-0.5", toneCls[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return (
    <div role="alert" className={cx("rounded-2xl px-5 py-3.5 text-sm ring-1 ring-current/15", toneCls[tone])}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-0.5 text-ink/80">{children}</div>}
    </div>
  );
}

/* ---------- KPI Card ---------- */
/** Tarjeta de dato. `detail` es un renglón chico justo debajo del título (por ejemplo la medida de un producto); `hint` va más abajo. */
export function KpiCard({ label, value, hint, detail, large, aligned }: { label: string; value: string; hint?: string; detail?: string; large?: boolean; aligned?: boolean }) {
  return (
    <div className="kpi lift group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card max-md:text-center">
      <span aria-hidden className="pointer-events-none absolute -right-7 -top-7 h-24 w-24 rounded-full bg-accent/10 transition-transform duration-500 group-hover:scale-[1.6]" />
      <p className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted max-md:justify-center">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent transition-transform duration-300 group-hover:scale-150" />
        {label}
      </p>
      <p className={`relative mt-3 font-display font-semibold tracking-tight text-ink max-md:whitespace-normal max-md:break-words md:truncate ${large ? "text-3xl md:text-4xl" : "text-xl md:text-[1.65rem]"} ${aligned ? "md:h-11 md:leading-[2.75rem]" : ""}`} title={value}><AnimatedValue value={value} /></p>
      {(detail || aligned) && <p className={`relative text-sm text-muted max-md:break-words md:truncate ${aligned ? "md:h-5" : ""}`} title={detail}>{detail}</p>}
      {hint && <p className="relative mt-1.5 whitespace-pre-line text-xs text-muted max-md:break-words">{hint}</p>}
    </div>
  );
}

/* ---------- Estados ---------- */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-accent/30 bg-surface/70 px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorState({ title = "Algo salió mal", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-danger/25 bg-danger/5 px-6 py-10 text-center">
      <p className="text-base font-semibold text-danger">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink/80">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
