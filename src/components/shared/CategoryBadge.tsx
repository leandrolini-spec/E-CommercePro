const HUES = [212, 152, 28, 332, 268, 0, 186, 48, 240, 120, 300, 18, 168, 80];

/** Color de una categoría: sale solo del nombre (sin importar mayúsculas ni tildes), así cada categoría nueva ya trae su color y siempre es el mismo. */
export function categoryHue(name: string) {
  const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** Etiqueta de categoría: mismo tamaño para todas y un color propio por categoría. */
export function CategoryBadge({ name }: { name?: string }) {
  const label = name?.trim() || "Sin categoría";
  const hue = name?.trim() ? categoryHue(name) : 215;
  const sat = name?.trim() ? 70 : 8;
  return (
    <span title={label} className="inline-flex h-6 w-28 items-center justify-center truncate rounded-full border px-2 text-xs font-medium"
      style={{ background: `hsl(${hue} ${sat}% 93%)`, color: `hsl(${hue} ${Math.min(sat, 55)}% 28%)`, borderColor: `hsl(${hue} ${sat}% 82%)` }}>
      <span className="truncate">{label}</span>
    </span>
  );
}
