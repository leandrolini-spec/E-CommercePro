import type { CSSProperties } from "react";

/** Aspecto de cada plataforma: colores de la marca en el banner, los botones, los bordes y el fondo de la sección (sutil pero visible). */
export type Platform = "ml" | "tn";

const THEMES: Record<Platform, { vars: Record<string, string>; tint: string; banner: { background: string; color: string; sub: string } }> = {
  ml: {
    // Amarillo de Mercado Libre en el banner, azul de acción de su interfaz, bordes y fondo con un tinte amarillo suave.
    vars: { "--crm-accent": "#e6c700", "--color-primary": "#3483fa", "--color-primary-hover": "#2968c8", "--color-line": "#e6e1be", "--color-ink": "#1f2352", "--color-muted": "#6b6f8e" },
    tint: "#fffbe0",
    banner: { background: "#ffe600", color: "#2d3277", sub: "rgba(45,50,119,0.75)" },
  },
  tn: {
    // Azul de Tienda Nube en el banner y los botones, bordes y fondo con un tinte azul suave.
    vars: { "--crm-accent": "#1f4fbf", "--color-primary": "#1f4fbf", "--color-primary-hover": "#1a43a3", "--color-line": "#d3def4", "--color-ink": "#10264f", "--color-muted": "#5f7096" },
    tint: "#f0f5ff",
    banner: { background: "linear-gradient(135deg, #1f4fbf, #2f66dc)", color: "#ffffff", sub: "rgba(255,255,255,0.82)" },
  },
};

/** Props para el contenedor de la sección: variables de color, fondo suave y espaciado. */
export function themeProps(platform: Platform, spacing = "space-y-4"): { className: string; style: CSSProperties } {
  const t = THEMES[platform];
  return { className: `${spacing} rounded-2xl p-4 md:p-5`, style: { ...t.vars, background: t.tint } as CSSProperties };
}

export const bannerOf = (platform: Platform) => THEMES[platform].banner;
