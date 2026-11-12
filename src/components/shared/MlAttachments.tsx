import type { MlAttachment } from "@/integrations/mercadolibre/data";

const url = (f: string) => `/api/ml/adjunto?f=${encodeURIComponent(f)}`;
const isImage = (a: MlAttachment) => /^image\//.test(a.type) || /\.(jpe?g|png|gif|webp)$/i.test(a.file);

/** Fotos y archivos que el comprador adjuntó a un mensaje: las imágenes se ven en miniatura y se abren completas con un toque. */
export function MlAttachments({ items }: { items?: MlAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {items.map((a) => isImage(a) ? (
        <a key={a.file} href={url(a.file)} target="_blank" rel="noreferrer" title={a.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url(a.file)} alt={a.name} loading="lazy" className="max-h-48 max-w-full rounded-md border border-line object-contain" />
        </a>
      ) : (
        <a key={a.file} href={url(a.file)} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-primary hover:bg-bg">Adjunto: {a.name}</a>
      ))}
    </div>
  );
}
