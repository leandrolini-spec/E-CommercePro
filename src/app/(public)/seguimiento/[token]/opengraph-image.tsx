import { ImageResponse } from "next/og";
import { brandColor, brandSoft } from "@/lib/brand";
import { getDb } from "@/modules/data";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Seguimiento de tu pedido";

/** Imagen que se ve en la vista previa de WhatsApp: el logo de la empresa sobre fondo claro (no hay datos del pedido). */
export default async function Image() {
  const db = await getDb().catch(() => null);
  const name = db?.settings.name ?? "Seguimiento de pedido";
  const logo = db?.settings.brand?.logoUrl ?? "";
  const accent = brandColor(db?.settings.brand);
  const isRaster = /\.(png|jpe?g)(\?|$)/i.test(logo); // la librería de imágenes no lee WEBP
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: brandSoft(db?.settings.brand), borderBottom: `18px solid ${accent}` }}>
        {logo && isRaster ? (
          <img src={logo} alt="" width={820} height={250} style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ fontSize: 110, fontWeight: 800, color: accent }}>{name}</div>
        )}
        <div style={{ marginTop: 40, fontSize: 52, color: "#334155" }}>Seguimiento de tu pedido</div>
      </div>
    ),
    size,
  );
}
