import Link from "next/link";
import { LabelPicker, type LabelRow } from "@/components/shared/LabelPicker";
import { PageHeader, param, type SearchParams } from "@/components/shared/list";
import { fdate } from "@/lib/format";
import { carrierName, isExternal } from "@/modules/carriers";
import { getDb } from "@/modules/data";
import { labelMissing } from "@/modules/labels";
import { stagesOf } from "@/modules/shipments";

/** Etiquetas de envío: se elige a quiénes imprimir (sin depender de la etapa) y cada una sale en el formato que le toca. */
export default async function EtiquetasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = await getDb();
  const stages = stagesOf(db.settings);
  const rows: LabelRow[] = [...(db.shipments ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((x) => ({
      id: x.id, customer: x.customer, address: x.address, city: x.city, carrier: carrierName(x.carrier), external: isExternal(x.carrier),
      channel: x.channel, orderRef: x.orderRef, stageId: x.stage, stageName: stages.find((s) => s.id === x.stage)?.name ?? x.stage,
      date: fdate(x.createdAt), final: ["entregado", "volvio"].includes(x.stage), missing: labelMissing(db, x),
    }));
  // Venir desde una etapa o desde un envío deja esos envíos ya elegidos.
  const ids = param(sp, "ids").split(",").map((s) => s.trim()).filter(Boolean);
  const stage = param(sp, "stage");
  const preselect = ids.length ? ids : stage ? rows.filter((r) => r.stageId === stage).map((r) => r.id) : [];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Etiquetas" subtitle="Elegí los envíos y se imprimen todas juntas: cada una sale con su formato (logística o Vía Cargo, Andreani y Correo Argentino)"
        actions={<><Link href="/etiquetas/pack" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover">Etiquetas de pack</Link><Link href="/envios" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:bg-bg">Ir a envíos</Link></>}
      />
      <LabelPicker rows={rows} stages={stages.map((s) => ({ id: s.id, name: s.name }))} preselect={preselect} />
    </div>
  );
}
