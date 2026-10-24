"use client";

import { Button } from "@/components/ui/primitives";

const TrashIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 9v4.5M11.5 9v4.5" />
  </svg>
);

/** Botón que pide confirmación antes de ejecutar una acción del servidor (para borrados). Con `icon` es un tacho de basura chiquito. */
export function ConfirmActionButton({ action, label, message, variant = "danger", small = false, icon = false, tall = false, medium = false }: {
  action: () => Promise<void>; label: string; message: string; variant?: "primary" | "secondary" | "danger"; small?: boolean; icon?: boolean; tall?: boolean; medium?: boolean;
}) {
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {icon ? (
        <button
          type="submit" title={label} aria-label={label}
          className={`inline-flex items-center justify-center rounded-md border border-danger/30 bg-surface text-danger transition hover:bg-danger/10 ${tall ? "h-9 w-9" : medium ? "h-8 w-8" : "h-7 w-7"}`}
        >
          <TrashIcon />
        </button>
      ) : (
        <Button type="submit" variant={variant} className={small ? "h-7 px-2 py-0 text-[11px]" : "h-8 px-2.5 py-0 text-xs"}>{label}</Button>
      )}
    </form>
  );
}
