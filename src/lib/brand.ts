import type { BrandInfo } from "@/modules/types";

/** Color principal y secundario (claro) de la marca. El secundario reemplaza al blanco en títulos del menú y da fondo y bordes suaves a los informes. */
export const DEFAULT_COLOR = "#16a34a";
export const DEFAULT_SOFT = "#FCFAF2";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const brandColor = (b?: BrandInfo) => (b?.color && HEX.test(b.color) ? b.color : DEFAULT_COLOR);
export const brandSoft = (b?: BrandInfo) => (b?.color2 && HEX.test(b.color2) ? b.color2 : DEFAULT_SOFT);

/** Borde suave: el color secundario oscurecido un poco (para que se vea sobre fondos claros). */
export const softBorder = (soft: string) => `color-mix(in srgb, ${soft} 78%, #000)`;
/** Fondo de encabezados de tabla: el secundario apenas oscurecido. */
export const softTint = (soft: string) => `color-mix(in srgb, ${soft} 92%, #000)`;
