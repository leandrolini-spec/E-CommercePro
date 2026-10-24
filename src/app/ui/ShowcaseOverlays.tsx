"use client";

import { useState } from "react";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";

export function ShowcaseOverlays() {
  const [which, setWhich] = useState<null | "modal" | "drawer" | "confirm">(null);
  const close = () => setWhich(null);
  return (
    <section className="flex gap-2">
      <Button variant="secondary" onClick={() => setWhich("modal")}>Abrir modal</Button>
      <Button variant="secondary" onClick={() => setWhich("drawer")}>Abrir drawer</Button>
      <Button variant="danger" onClick={() => setWhich("confirm")}>Confirmar</Button>
      <Modal open={which === "modal"} onClose={close} title="Modal de ejemplo">Contenido del modal.</Modal>
      <Drawer open={which === "drawer"} onClose={close} title="Drawer de ejemplo">Contenido del panel lateral.</Drawer>
      <ConfirmDialog open={which === "confirm"} onClose={close} onConfirm={() => {}} title="¿Eliminar?" message="Esta acción no se puede deshacer." confirmLabel="Eliminar" danger />
    </section>
  );
}
