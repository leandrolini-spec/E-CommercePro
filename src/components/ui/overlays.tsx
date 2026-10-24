"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./primitives";

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [onClose]);
  return ref;
}

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode };

export function Modal({ open, onClose, title, children, footer }: OverlayProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className="m-auto w-full max-w-lg rounded-lg border border-line bg-surface p-0 shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-ink">✕</button>
      </div>
      <div className="px-5 py-4 text-sm">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 max-md:[&>*]:flex-1">{footer}</div>}
    </dialog>
  );
}

export function Drawer({ open, onClose, title, children, footer }: OverlayProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog ref={ref} className="m-0 ml-auto h-full max-h-none w-full max-w-md rounded-none border-l border-line bg-surface p-0 shadow-xl">
      <div className="flex h-full flex-col">
        <div className="relative flex items-center justify-between border-b border-line px-5 py-3 max-md:justify-center max-md:px-12">
          <h2 className="text-base font-semibold max-md:text-center">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-ink max-md:absolute max-md:right-4 max-md:top-1/2 max-md:-translate-y-1/2">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = "Confirmar", danger,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
