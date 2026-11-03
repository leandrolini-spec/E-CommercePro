/* eslint-disable @next/next/no-img-element */

/** Logo de Carritix (isotipo + palabra, ya convertidos a trazados: no dependen de ninguna tipografía). `onDark` usa la versión para fondos oscuros. */
export function CarritixLogo({ onDark = false, className = "h-12 w-auto" }: { onDark?: boolean; className?: string }) {
  return <img src={onDark ? "/brand/carritix/carritix-logo-claro.svg" : "/brand/carritix/carritix-logo.svg"} alt="Carritix" className={className} />;
}
