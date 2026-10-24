"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/overlays";

/** El nombre de un contacto como botón: al tocarlo abre su tarjeta con los datos y el botón Editar. */
export function NameCardButton({ name, title, children }: { name: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Ver la tarjeta del contacto" className="text-left font-medium text-ink hover:text-primary hover:underline">{name}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>{children}</Modal>
    </>
  );
}
