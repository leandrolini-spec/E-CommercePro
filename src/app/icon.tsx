import { ImageResponse } from "next/og";
import { brandColor } from "@/lib/brand";
import { getDb } from "@/modules/data";

export const dynamic = "force-dynamic";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Ícono de la pestaña: la inicial de la empresa sobre su color de marca (así no aparece el ícono por defecto del proyecto). */
export default async function Icon() {
  const db = await getDb().catch(() => null);
  const letter = (db?.settings.name ?? "T").trim().charAt(0).toUpperCase() || "T";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: brandColor(db?.settings.brand), color: "#fff", fontSize: 42, fontWeight: 800, borderRadius: 14 }}>
        {letter}
      </div>
    ),
    size,
  );
}
