import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/shared/PrintButton";
import { QuoteSheet } from "@/components/shared/QuoteSheet";
import { getDb } from "@/modules/data";

/** Presupuesto listo para imprimir o guardar como PDF (versión interna, con acceso al CRM). */
export default async function PresupuestoImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const q = db.quotes.find((x) => x.id === id);
  if (!q) notFound();
  return (
    <QuoteSheet
      db={db} q={q}
      top={
        <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
          <Link href="/presupuestos" className="text-sm text-gray-500 underline">← Volver a presupuestos</Link>
          <PrintButton />
        </div>
      }
    />
  );
}
