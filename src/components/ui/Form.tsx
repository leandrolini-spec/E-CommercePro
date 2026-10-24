import type { FormHTMLAttributes, ReactNode } from "react";

/** Contenedor de formulario: apila los campos y ubica las acciones al pie. */
export function Form({ children, actions, ...props }: FormHTMLAttributes<HTMLFormElement> & { actions?: ReactNode }) {
  return (
    <form {...props} className="space-y-4">
      {children}
      {actions && <div className="flex justify-end gap-2 pt-2">{actions}</div>}
    </form>
  );
}
