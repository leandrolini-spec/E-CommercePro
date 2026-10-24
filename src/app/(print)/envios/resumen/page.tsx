import Link from "next/link";
import { PrintButton } from "@/components/shared/PrintButton";
import { param, type SearchParams } from "@/components/shared/list";
import { fdate, int, today } from "@/lib/format";
import { carrierName } from "@/modules/carriers";
import { deliveryRules, entregaLabel, estimateDelivery } from "@/modules/delivery";
import { getDb } from "@/modules/data";
import { splitOrderItems, TRAY_COMPOSITION, trayOf } from "@/modules/grower";
import { stagesOf } from "@/modules/shipments";
import type { Shipment } from "@/modules/types";

const FINAL = ["entregado", "volvio", "no_entregado"];

/** Por cada línea de un pedido ("2 × Pack de 200 …") devuelve cantidad y nombre del producto. */
function linesOf(x: Shipment): { qty: number; name: string }[] {
  const lines = splitOrderItems(x.items).products.map((l) => {
    const m = l.match(/^(\d+)\s*×\s*(.+)$/);
    return m ? { qty: Number(m[1]) || 1, name: m[2].trim() } : { qty: 1, name: l };
  });
  return lines.length ? lines : x.items.trim() ? [{ qty: 1, name: x.items.trim() }] : [];
}

/** Resumen de envíos para imprimir: cuántos hay en cada etapa, qué productos y cuántas unidades, y los nombres de las personas. */
export default async function ResumenEnviosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = await getDb();
  const stages = stagesOf(db.settings);
  const rules = deliveryRules(db.settings.company);
  const picked = param(sp, "etapas");
  // Sin elegir, salen las etapas en curso (no las ya entregadas ni las que volvieron).
  const active = new Set(picked ? picked.split(",").filter(Boolean) : stages.filter((s) => !FINAL.includes(s.id)).map((s) => s.id));
  const toggle = (id: string) => { const n = new Set(active); if (n.has(id)) n.delete(id); else n.add(id); return `?etapas=${[...n].join(",")}`; };
  const all = db.shipments ?? [];
  const sections = stages.filter((s) => active.has(s.id)).map((s) => {
    const list = all.filter((x) => x.stage === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const totals = new Map<string, number>();
    for (const x of list) for (const l of linesOf(x)) totals.set(l.name, (totals.get(l.name) ?? 0) + l.qty);
    return { stage: s, list, totals: [...totals.entries()].sort((a, b) => b[1] - a[1]), units: [...totals.values()].reduce((a, b) => a + b, 0) };
  });
  const grand = sections.reduce((a, s) => a + s.list.length, 0);
  // Lo que hay que entregar: los pedidos de las etapas elegidas que todavía no se entregaron, contados por tipo de pack.
  const UNITS_PER_PACK: Record<string, number> = { "200": 200, "70": 70, "70e": 70, "50": 45 };
  const owed = new Map<string, number>();
  let others = 0, ordersOwed = 0;
  for (const sec of sections) {
    if (FINAL.includes(sec.stage.id)) continue;
    ordersOwed += sec.list.length;
    for (const x of sec.list) for (const l of linesOf(x)) {
      const t = trayOf(`${l.qty} × ${l.name}`);
      if (t) owed.set(t.tray.key, (owed.get(t.tray.key) ?? 0) + t.qty); else others += l.qty;
    }
  }
  const trayCards = TRAY_COMPOSITION.map((t) => ({ key: t.key, label: t.publicName ?? t.name, per: UNITS_PER_PACK[t.key], n: owed.get(t.key) ?? 0 })).filter((t) => t.n > 0);
  const totalTrays = trayCards.reduce((a, t) => a + t.n, 0);
  const totalProductos = trayCards.reduce((a, t) => a + t.n * t.per, 0);
  const now = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 text-black print:max-w-none print:p-0">
      <style>{"@page { size: A4; margin: 12mm } .sec { break-inside: avoid-page; } tr { break-inside: avoid; }"}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/envios" className="text-sm text-gray-500 underline">← Volver a Envíos</Link>
        <PrintButton />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 print:hidden">
        <span className="mr-1 text-xs font-medium text-gray-500">Etapas a incluir:</span>
        {stages.map((s) => <Link key={s.id} href={toggle(s.id)} className={`rounded-full border px-2.5 py-1 text-xs ${active.has(s.id) ? "border-black bg-black text-white" : "border-gray-300 text-gray-500"}`}>{s.name}</Link>)}
      </div>

      <header className="mb-3 border-b-2 border-black pb-2">
        <h1 className="text-[22px] font-extrabold leading-tight">Resumen de envíos</h1>
        <p className="text-[12px] text-gray-700">{db.settings.name} · {now} · {int(grand)} pedido{grand === 1 ? "" : "s"} en total</p>
      </header>

      <section className="mb-5 rounded-lg border-2 border-black p-3 [break-inside:avoid]">
        <p className="text-[13px] font-extrabold uppercase tracking-wide">Para entregar · {int(ordersOwed)} pedido{ordersOwed === 1 ? "" : "s"}</p>
        {trayCards.length === 0 && others === 0 ? <p className="mt-1 text-[12px] text-gray-600">No hay pedidos para entregar en las etapas elegidas.</p> : (
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            {trayCards.map((t) => (
              <div key={t.key} className="rounded-md border border-black px-2 py-2 text-center">
                <p className="text-[11px] font-bold uppercase leading-tight">{t.label}</p>
                <p className="text-[34px] font-extrabold leading-none tabular-nums">{t.n}</p>
                <p className="mt-0.5 text-[11px] text-gray-700">pack{t.n === 1 ? "" : "s"} · {int(t.n * t.per)} productos</p>
              </div>
            ))}
            <div className="rounded-md bg-black px-2 py-2 text-center text-white">
              <p className="text-[11px] font-bold uppercase leading-tight">Total</p>
              <p className="text-[34px] font-extrabold leading-none tabular-nums">{int(totalProductos)}</p>
              <p className="mt-0.5 text-[11px]">productos · {totalTrays} pack{totalTrays === 1 ? "" : "s"}</p>
            </div>
          </div>
        )}
        {others > 0 && <p className="mt-2 text-[11.5px] text-gray-700">Además: {others} unidad{others === 1 ? "" : "es"} de otros productos (ver detalle abajo).</p>}
      </section>

      <table className="mb-5 w-full border-collapse text-[13px]">
        <thead><tr className="bg-gray-100 text-left"><th className="border border-gray-300 px-2 py-1">Etapa</th><th className="border border-gray-300 px-2 py-1 text-right">Pedidos</th><th className="border border-gray-300 px-2 py-1 text-right">Unidades</th><th className="border border-gray-300 px-2 py-1">Productos</th></tr></thead>
        <tbody>
          {sections.map(({ stage, list, totals, units }) => (
            <tr key={stage.id}>
              <td className="border border-gray-300 px-2 py-1 font-semibold">{stage.name}</td>
              <td className="border border-gray-300 px-2 py-1 text-right font-semibold tabular-nums">{list.length}</td>
              <td className="border border-gray-300 px-2 py-1 text-right tabular-nums">{units}</td>
              <td className="border border-gray-300 px-2 py-1">{totals.map(([n, q]) => `${q} × ${n}`).join(" · ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sections.map(({ stage, list, totals, units }) => (
        <section key={stage.id} className="sec mb-5">
          <h2 className="flex items-baseline justify-between border-b border-black pb-1 text-[16px] font-extrabold">
            <span>{stage.name}</span><span className="text-[12px] font-semibold text-gray-700">{list.length} pedido{list.length === 1 ? "" : "s"} · {units} unidad{units === 1 ? "" : "es"}</span>
          </h2>
          {totals.length > 0 && <p className="mt-1 text-[12px] text-gray-800"><strong>Total por producto:</strong> {totals.map(([n, q]) => `${q} × ${n}`).join(" · ")}</p>}
          {list.length === 0 ? <p className="mt-1 text-[12px] text-gray-500">Sin pedidos en esta etapa.</p> : (
            <table className="mt-1.5 w-full table-fixed border-collapse text-[11.5px]">
              <colgroup><col style={{ width: "4%" }} /><col style={{ width: "19%" }} /><col style={{ width: "23%" }} /><col style={{ width: "27%" }} /><col style={{ width: "14%" }} /><col style={{ width: "13%" }} /></colgroup>
              <thead><tr className="bg-gray-100 text-left"><th className="w-6 border border-gray-300 px-1.5 py-1">#</th><th className="border border-gray-300 px-1.5 py-1">Nombre</th><th className="border border-gray-300 px-1.5 py-1">Producto y cantidad</th><th className="border border-gray-300 px-1.5 py-1">Dirección de entrega</th><th className="border border-gray-300 px-1.5 py-1">Teléfono</th><th className="border border-gray-300 px-1.5 py-1">Entrega</th></tr></thead>
              <tbody>
                {list.map((x, i) => (
                  <tr key={x.id}>
                    <td className="border border-gray-300 px-1.5 py-1 text-gray-500">{i + 1}</td>
                    <td className="border border-gray-300 px-1.5 py-1 font-semibold [overflow-wrap:anywhere]">{x.customer || "Sin nombre"}<div className="text-[10.5px] font-normal text-gray-600">{x.channel} · {x.orderRef}</div></td>
                    <td className="border border-gray-300 px-1.5 py-1">{linesOf(x).map((l) => `${l.qty} × ${l.name}`).join(" · ") || "—"}</td>
                    <td className="border border-gray-300 px-1.5 py-1 [overflow-wrap:anywhere]">{x.address?.trim() || <span className="text-gray-500">Sin dirección</span>}<div className="text-[11px] text-gray-700">{x.city || ""}{x.zip ? ` · CP ${x.zip}` : ""}</div></td>
                    <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">{x.phone?.trim() || <span className="text-gray-500">Sin teléfono</span>}</td>
                    <td className="border border-gray-300 px-1.5 py-1">{FINAL.includes(x.stage) ? (x.deliveredAt ? fdate(x.deliveredAt) : "—") : ["viacargo", "andreani", "correo"].includes(x.carrier ?? "") ? carrierName(x.carrier) : entregaLabel(x.eta ?? estimateDelivery(x.createdAt, rules))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      <p className="mt-3 text-[10.5px] text-gray-500">Impreso el {fdate(today())} desde el CRM de {db.settings.name}.</p>
    </div>
  );
}
