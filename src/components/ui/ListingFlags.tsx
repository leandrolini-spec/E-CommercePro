import type { MlItem } from "@/integrations/mercadolibre/data";

/** Iconos de una publicación: promoción especial (etiqueta naranja) y publicidad paga (megáfono violeta). */
export function ListingFlags({ item }: { item: Pick<MlItem, "promo" | "ads"> }) {
  if (!item.promo && !item.ads) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {item.promo && (
        <span title={`Promoción especial: ${item.promo}`} aria-label="Promoción especial" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-warning/15 text-warning">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path fillRule="evenodd" d="M2 4a2 2 0 0 1 2-2h5.6a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8l-5.6 5.6a2 2 0 0 1-2.8 0L2.6 11A2 2 0 0 1 2 9.6V4Zm4 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" clipRule="evenodd" /></svg>
        </span>
      )}
      {item.ads && (
        <span title="Publicidad paga (Product Ads) activa" aria-label="Publicidad paga" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#7c3aed]/15 text-[#7c3aed]">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M16 3a1 1 0 0 0-1.5-.86l-7.2 4.1H4.5A2.5 2.5 0 0 0 2 8.7v2.6A2.5 2.5 0 0 0 4.5 13.8h.3l.9 3.1a1 1 0 0 0 .96.72h1.2a1 1 0 0 0 .96-1.28L8.1 13.4l6.4 3.64A1 1 0 0 0 16 16.2V3Z" /></svg>
        </span>
      )}
    </span>
  );
}
