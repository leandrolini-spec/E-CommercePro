/** Esqueleto que se ve al instante al cambiar de pantalla, mientras el servidor termina de armar la página (se siente mucho más rápido). */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-56 rounded-md bg-line" />
      <div className="h-4 w-80 max-w-full rounded bg-line/70" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg border border-line bg-surface" />)}
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 h-5 w-40 rounded bg-line" />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="mb-2 h-9 rounded bg-line/50" />)}
      </div>
    </div>
  );
}
