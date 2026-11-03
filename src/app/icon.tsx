import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = { width: 64, height: 64 };

/** Ícono de la pestaña: el isotipo de Carritix (carrito con ruedas verdes sobre fondo tinta). */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="15" fill="#0F1115" />
        <path d="M13 19h7l5 22h22l5-17H22" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="28" cy="49" r="3.6" fill="#19C37D" />
        <circle cx="44" cy="49" r="3.6" fill="#19C37D" />
      </svg>
    ),
    size,
  );
}
