"use client";

import { useEffect, useRef } from "react";

/** Dentro de un formulario de filtros: al elegir una opción o una fecha se aplica el filtro solo, sin apretar "Filtrar". */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date")) form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
