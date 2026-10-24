"use client";

/** Abre el diálogo de impresión del navegador: ahí se elige "Guardar como PDF". No se imprime este botón. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
      🖨 Imprimir o guardar como PDF
    </button>
  );
}
