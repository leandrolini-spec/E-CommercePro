import type { BrandInfo } from "@/modules/types";

/** Tipografías disponibles (Google Fonts). `weights` son los pesos que existen de cada una; `bold` es el que se usa en títulos. */
export type FontDef = { name: string; group: "Destacadas" | "Sans serif" | "Serif" | "Display"; weights: number[]; bold: number };

export const FONT_CATALOG: FontDef[] = [
  { name: "Nunito", group: "Destacadas", weights: [400, 700, 800], bold: 800 },
  { name: "Baloo 2", group: "Destacadas", weights: [400, 700, 800], bold: 800 },
  { name: "Montserrat", group: "Destacadas", weights: [400, 600, 700], bold: 700 },
  { name: "Inter", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Poppins", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Roboto", group: "Sans serif", weights: [400, 500, 700], bold: 700 },
  { name: "Open Sans", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Lato", group: "Sans serif", weights: [400, 700], bold: 700 },
  { name: "Raleway", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "DM Sans", group: "Sans serif", weights: [400, 500, 700], bold: 700 },
  { name: "Work Sans", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Quicksand", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Source Sans 3", group: "Sans serif", weights: [400, 600, 700], bold: 700 },
  { name: "Playfair Display", group: "Serif", weights: [400, 700], bold: 700 },
  { name: "Merriweather", group: "Serif", weights: [400, 700], bold: 700 },
  { name: "Lora", group: "Serif", weights: [400, 600, 700], bold: 700 },
  { name: "Oswald", group: "Display", weights: [400, 500, 700], bold: 700 },
  { name: "Bebas Neue", group: "Display", weights: [400], bold: 400 },
];

/** Lo que dice el manual de marca. */
export const DEFAULT_FONTS = { title: "Nunito", subtitle: "Montserrat", text: "Nunito" };

export const fontOk = (name: string) => FONT_CATALOG.some((f) => f.name === name);
export const fontBold = (name: string) => FONT_CATALOG.find((f) => f.name === name)?.bold ?? 700;

export function brandFonts(b: BrandInfo | undefined) {
  return {
    title: b?.fontTitle && fontOk(b.fontTitle) ? b.fontTitle : DEFAULT_FONTS.title,
    subtitle: b?.fontSubtitle && fontOk(b.fontSubtitle) ? b.fontSubtitle : DEFAULT_FONTS.subtitle,
    text: b?.fontText && fontOk(b.fontText) ? b.fontText : DEFAULT_FONTS.text,
  };
}

/** Dirección de Google Fonts para cargar las tipografías indicadas (solo con los pesos que existen). */
export function fontsHref(names: string[]): string {
  const fams = [...new Set(names)].map((n) => FONT_CATALOG.find((f) => f.name === n)).filter((f): f is FontDef => Boolean(f))
    .map((f) => `family=${f.name.replace(/ /g, "+")}:wght@${f.weights.join(";")}`);
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}
