"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mantiene las pantallas al día sin recargar a mano: vuelve a leer los datos cada tanto y al volver a la pestaña.
 * No actualiza mientras hay un formulario abierto, para no molestar a quien está escribiendo.
 */
export function AutoRefresh({ everyMs = 120_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const busy = () => !!document.querySelector("dialog[open]");
    const refresh = () => { if (document.visibilityState === "visible" && !busy()) router.refresh(); };
    const timer = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router, everyMs]);
  return null;
}
