"use client";

import { useState } from "react";

/** Permite corregir cualquier dato escrito en las etiquetas antes de imprimir (solo para esta impresión: no cambia el envío ni el cliente). */
export function LabelEditor() {
  const [on, setOn] = useState(false);
  function toggle() {
    const next = !on;
    document.querySelectorAll<HTMLElement>(".label").forEach((el) => { el.contentEditable = next ? "true" : "false"; el.classList.toggle("label-editing", next); });
    if (next) document.querySelector<HTMLElement>(".label [contenteditable], .label")?.focus();
    setOn(next);
  }
  return (
    <>
      <style>{".label-editing { outline: 2px dashed #f59e0b; background: #fffbeb; cursor: text } .label-editing:focus { outline-color: #d97706 } @media print { .label-editing { outline: none !important; background: transparent !important } }"}</style>
      <button type="button" onClick={toggle} className={`rounded-md border px-3 py-1.5 text-sm ${on ? "border-amber-500 bg-amber-100 text-amber-900" : "border-gray-300 text-gray-600"}`}>{on ? "Listo: terminé de editar" : "Editar el texto de las etiquetas"}</button>
    </>
  );
}
