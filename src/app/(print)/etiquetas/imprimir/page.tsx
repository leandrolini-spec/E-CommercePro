import Link from "next/link";
import { LabelEditor } from "@/components/shared/LabelEditor";
import { PrintButton } from "@/components/shared/PrintButton";
import { param, type SearchParams } from "@/components/shared/list";
import { carrierName, isExternal } from "@/modules/carriers";
import { getDb } from "@/modules/data";
import { labelCustomerDoc, labelMissing, labelOwner, labelPurchase } from "@/modules/labels";
import type { Db, Shipment } from "@/modules/types";

/** Etiquetas de envío para imprimir y pegar en las cajas. Logística: nombre, dirección, localidad y teléfono. Vía Cargo, Andreani y Correo Argentino: destinatario y remitente completos. */
export default async function EtiquetasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = await getDb();
  const ids = param(sp, "ids").split(",").map((s) => s.trim()).filter(Boolean);
  const format = param(sp, "f") === "10x15" ? "10x15" : "a4";
  const list = ids.map((id) => (db.shipments ?? []).find((x) => x.id === id)).filter((x): x is Shipment => !!x);
  const qs = (f: string) => { const u = new URLSearchParams(); if (ids.length) u.set("ids", ids.join(",")); u.set("f", f); return `?${u}`; };
  const incomplete = list.filter((x) => labelMissing(db, x).length > 0).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">
      <style>{format === "10x15"
        ? "@page { size: 100mm 150mm; margin: 0 } .label { width: 100mm; height: 150mm; page-break-after: always; border: none !important; }"
        : "@page { size: A4; margin: 8mm } @media print { .sheet { gap: 0 !important } }"}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/etiquetas" className="text-sm text-gray-500 underline">← Volver a elegir etiquetas</Link>
        <div className="flex flex-wrap items-center gap-2">
          {([["a4", "Hoja A4 (4 por hoja)"], ["10x15", "Etiqueta 10 × 15 cm"]] as const).map(([k, label]) => (
            <Link key={k} href={qs(k)} className={`rounded-md border px-3 py-1.5 text-sm ${k === format ? "border-black bg-black text-white" : "border-gray-300 text-gray-600"}`}>{label}</Link>
          ))}
          <LabelEditor />
          <PrintButton />
        </div>
      </div>
      <p className="mb-4 text-sm text-gray-600 print:hidden">
        {list.length === 0 ? "No hay etiquetas para imprimir: volvé y elegí los envíos." : `${list.length} etiqueta${list.length === 1 ? "" : "s"}.`}
        {incomplete > 0 && <strong className="ml-1 text-red-600">{incomplete} con datos incompletos: se marcan en rojo en pantalla y no se imprimen en rojo. Completalos con Editar en Envíos antes de imprimir.</strong>}
      </p>
      <p className="mb-3 text-xs text-gray-500 print:hidden">¿Cambió algún dato, como el remitente? Tocá <strong>Editar el texto de las etiquetas</strong> y corregilo directamente: el cambio vale solo para esta impresión. Para cambiarlo siempre: el destinatario se edita en Envíos (lápiz) y el remitente en <Link href="/configuracion" className="underline">Configuración → Empresa</Link>.</p>
      <div className={format === "a4" ? "sheet grid grid-cols-2 gap-3" : ""}>
        {list.map((x) => <Label key={x.id} db={db} x={x} />)}
      </div>
    </div>
  );
}

function Blank({ v }: { v?: string }) {
  return v?.trim() ? <>{v}</> : <span className="inline-block min-w-24 border-b border-black align-bottom print:min-w-24">&nbsp;</span>;
}

function Label({ db, x }: { db: Db; x: Shipment }) {
  const warn = labelMissing(db, x);
  const ext = isExternal(x.carrier);
  const o = labelOwner(db);
  const box = "label flex flex-col break-inside-avoid border border-dashed border-gray-400 p-5 text-black";
  const flag = warn.length > 0 ? <p className="mb-2 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 print:hidden">Falta: {warn.join(", ")}</p> : null;

  if (!ext) {
    return (
      <section className={box} style={{ minHeight: "13.5cm" }}>
        {flag}
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Destinatario</p>
        <p className="mt-2 text-[34px] font-extrabold leading-tight"><Blank v={x.customer} /></p>
        <dl className="mt-7 space-y-7 text-[26px] leading-snug">
          <div><dt className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Dirección</dt><dd className="font-semibold"><Blank v={x.address} /></dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Localidad</dt><dd className="font-semibold"><Blank v={x.city} />{x.zip ? ` · CP ${x.zip}` : ""}</dd></div>
          <div><dt className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Teléfono</dt><dd className="font-semibold"><Blank v={x.phone} /></dd></div>
        </dl>
        <p className="mt-auto flex justify-between gap-2 border-t border-gray-300 pt-2 text-[9px] text-gray-600"><span>{labelPurchase(x)}</span><span>{db.settings.name}</span></p>
      </section>
    );
  }
  // Vía Cargo / Andreani / Correo Argentino: destinatario y remitente completos (nombre, DNI, teléfono, ciudad, CP).
  return (
    <section className={box} style={{ minHeight: "13.5cm" }}>
      {flag}
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Envío por {carrierName(x.carrier)}</p>
      <div className="mt-2 rounded-md border-2 border-black p-3">
        <p className="text-[12px] font-extrabold uppercase tracking-widest">Destinatario</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight"><Blank v={x.customer} /></p>
        <dl className="mt-2 space-y-1 text-[16px] leading-snug">
          <div><span className="font-bold">DNI:</span> <Blank v={labelCustomerDoc(db, x)} /></div>
          <div><span className="font-bold">Tel:</span> <Blank v={x.phone} /></div>
          <div><span className="font-bold">Dirección:</span> <Blank v={x.address} /></div>
          <div><span className="font-bold">Ciudad:</span> <Blank v={x.city} /></div>
          <div><span className="font-bold">CP:</span> <Blank v={x.zip} /></div>
        </dl>
      </div>
      <div className="mt-3 rounded-md border border-black p-3">
        <p className="text-[12px] font-extrabold uppercase tracking-widest">RTE (remitente)</p>
        <p className="mt-1 text-[16px] font-bold leading-tight"><Blank v={o.name} /></p>
        <dl className="mt-1 space-y-0.5 text-[14px] leading-snug">
          <div><span className="font-bold">DNI:</span> <Blank v={o.doc} /></div>
          <div><span className="font-bold">Tel:</span> <Blank v={o.phone} /></div>
          <div><span className="font-bold">Ciudad:</span> <Blank v={o.city} /></div>
          <div><span className="font-bold">CP:</span> <Blank v={o.zip} /></div>
        </dl>
      </div>
      <p className="mt-auto flex justify-between gap-2 border-t border-gray-300 pt-2 text-[9px] text-gray-600"><span>{labelPurchase(x)}</span><span>{x.tracking ? `Seguimiento ${x.tracking}` : db.settings.name}</span></p>
    </section>
  );
}
