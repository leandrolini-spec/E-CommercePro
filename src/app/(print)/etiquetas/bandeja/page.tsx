import Link from "next/link";
import { PrintButton } from "@/components/shared/PrintButton";
import { param, type SearchParams } from "@/components/shared/list";
import { deliveryRules, entregaLabel, estimateDelivery } from "@/modules/delivery";
import { getDb } from "@/modules/data";
import { isProductosOrder, splitOrderItems, trayOf } from "@/modules/grower";
import type { Shipment } from "@/modules/types";

/** Etiquetas de referencia para pegar en cada pack (una por pack): pedido, cliente, tipo de pack, fecha de entrega y lo que eligió el cliente. Salen 10 por hoja A4. */
export default async function EtiquetasPackPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = await getDb();
  const rules = deliveryRules(db.settings.company);
  const ids = param(sp, "ids").split(",").map((s) => s.trim()).filter(Boolean);
  // Sin elegir, salen los pedidos de productos que están en Compra o Empaquetado.
  const list: Shipment[] = (ids.length
    ? ids.map((id) => (db.shipments ?? []).find((x) => x.id === id)).filter((x): x is Shipment => !!x)
    : (db.shipments ?? []).filter((x) => ["compra", "preparado", "empaquetado"].includes(x.stage) && isProductosOrder(x.items))
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const labels = list.flatMap((x) => {
    const it = splitOrderItems(x.items);
    const trays = it.products.map(trayOf).filter((t): t is NonNullable<ReturnType<typeof trayOf>> => !!t);
    const total = trays.reduce((s, t) => s + t.qty, 0);
    let n = 0;
    return trays.flatMap((t) => Array.from({ length: t.qty }, () => ({ x, it, tray: t.tray, n: ++n, total })));
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">
      <style>{"@page { size: A4; margin: 8mm } .bl { width: 100%; height: 55mm; overflow: hidden; break-inside: avoid; } @media print { .bsheet { gap: 0 !important } }"}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/etiquetas" className="text-sm text-gray-500 underline">← Volver a Etiquetas</Link>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-gray-600 print:hidden">
        {labels.length === 0 ? "No hay packs para etiquetar: los pedidos de productos en Compra, Preparado o Empaquetado aparecen acá solos." : `${labels.length} etiqueta${labels.length === 1 ? "" : "s"} (una por pack), de ${list.length} pedido${list.length === 1 ? "" : "s"}. Salen 10 por hoja A4.`}
      </p>
      <div className="bsheet grid grid-cols-2 gap-2">
        {labels.map((l, i) => (
          <section key={`${l.x.id}-${i}`} className="bl flex flex-col border border-dashed border-gray-400 p-2.5 text-black">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[19px] font-extrabold leading-tight [overflow-wrap:anywhere]">{l.x.customer || "Cliente"}</p>
              <p className="shrink-0 rounded bg-black px-1.5 py-0.5 text-[13px] font-bold text-white">{l.n} de {l.total}</p>
            </div>
            <p className="text-[12.5px] font-semibold text-gray-700">Pedido {l.x.orderRef} · {l.tray.publicName ?? l.tray.name} · Entrega {entregaLabel(l.x.eta ?? estimateDelivery(l.x.createdAt, rules))}</p>
            <p className="mt-1 text-[13px] leading-snug"><strong>Lleva:</strong> {l.tray.detail}</p>
            {l.it.detail.length > 0 && <p className="mt-0.5 text-[13px] leading-snug"><strong>Pidió:</strong> {l.it.detail.join(", ")}</p>}
            {l.it.aclaracion && <p className="mt-0.5 text-[13px] leading-snug"><strong>Aclaración:</strong> {l.it.aclaracion}</p>}
            {l.x.notes && l.x.notes.length <= 100 && <p className="mt-0.5 text-[13px] leading-snug"><strong>Nota:</strong> {l.x.notes.replace(/\s+/g, " ")}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
