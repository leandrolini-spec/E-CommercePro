/* eslint-disable @next/next/no-img-element */

/** Logo de Carrix (isotipo + palabra, ya convertidos a trazados: no dependen de ninguna tipografía). `onDark` usa la versión para fondos oscuros. */
export function CarrixLogo({ onDark = false, className = "h-12 w-auto" }: { onDark?: boolean; className?: string }) {
  return <img src={onDark ? "/brand/carrix/carrix-logo-claro.svg" : "/brand/carrix/carrix-logo.svg"} alt="Carrix" className={className} />;
}
