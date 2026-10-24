"use client";

import { Button, ErrorState } from "@/components/ui/primitives";

// Evita la pantalla genérica: muestra qué pasó y permite reintentar.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const hint = /401|Invalid API key|jwt|No se pudo leer/i.test(error.message)
    ? "El servidor no pudo leer la base de datos. Revisá que SUPABASE_SERVICE_ROLE_KEY esté bien cargada en el servidor."
    : "Ocurrió un error al cargar esta pantalla. Probá de nuevo en un momento.";
  return (
    <div className="p-8">
      <ErrorState title="No se pudo cargar" description={hint} action={<Button onClick={reset}>Reintentar</Button>} />
    </div>
  );
}
