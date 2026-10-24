import { notFound } from "next/navigation";
import { PrintButton } from "@/components/shared/PrintButton";
import { QuoteSheet } from "@/components/shared/QuoteSheet";
import { getDb } from "@/modules/data";

export const metadata = { title: "Presupuesto", robots: { index: false, follow: false } };

/** Presupuesto para el cliente: se abre con el link que se le envía (clave larga, no se puede adivinar). */
export default async function PresupuestoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,}$/.test(token)) notFound();
  const db = await getDb();
  const q = db.quotes.find((x) => x.shareToken && x.shareToken === token);
  if (!q) notFound();
  return (
    <QuoteSheet
      db={db} q={q}
      top={<div className="mb-6 flex justify-end print:hidden"><PrintButton /></div>}
    />
  );
}
