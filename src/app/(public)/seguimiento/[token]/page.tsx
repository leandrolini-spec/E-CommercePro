/* eslint-disable @next/next/no-img-element */
import { carrierName, isExternal, isOwn } from "@/modules/carriers";
import { notFound } from "next/navigation";
import { waLink } from "@/lib/contact";
import { fdate } from "@/lib/format";
import { brandColor, brandSoft, softBorder } from "@/lib/brand";
import { brandFonts, fontBold, fontsHref } from "@/lib/fonts";
import { getDb } from "@/modules/data";
import { deliveryRules, entregaLabel, estimateDelivery, horarioLabel, retiroLabel } from "@/modules/delivery";
import { shipmentIdFromToken } from "@/modules/seguimiento";
import { stagesOf } from "@/modules/shipments";

/** Lo que muestra WhatsApp al pegar el enlace: nombre de la empresa e imagen con su logo (en lugar del ícono por defecto). */
export async function generateMetadata() {
  const db = await getDb().catch(() => null);
  const name = db?.settings.name ?? "Tu pedido";
  const description = `Seguí el estado de tu pedido y la fecha de entrega. ${name}.`;
  return {
    title: `Seguimiento de tu pedido · ${name}`, description, robots: { index: false, follow: false },
    openGraph: { title: `Seguimiento de tu pedido · ${name}`, description, siteName: name, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title: `Seguimiento de tu pedido · ${name}`, description },
  };
}
export const dynamic = "force-dynamic";

const CHECK = <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="m4 10.5 4 4 8-9" /></svg>;

/** Seguimiento de un pedido para el cliente: estado, fecha estimada, chofer y datos del envío. Se abre con el enlace que recibe por WhatsApp. */
export default async function SeguimientoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = shipmentIdFromToken(token);
  if (!id) notFound();
  const db = await getDb();
  const x = (db.shipments ?? []).find((s) => s.id === id);
  if (!x) notFound();

  const company = db.settings.company ?? {}, brand = db.settings.brand ?? {};
  const accent = brandColor(brand), soft = brandSoft(brand), line = softBorder(soft);
  const f = brandFonts(brand);
  const fam = (n: string) => `"${n}", system-ui, sans-serif`;
  const rules = deliveryRules(company);
  const stages = stagesOf(db.settings);
  const flow = stages.filter((s) => !["no_entregado", "volvio"].includes(s.id));
  const idx = Math.max(0, flow.findIndex((s) => s.id === x.stage));
  const problem = ["no_entregado", "volvio"].includes(x.stage);
  const current = stages.find((s) => s.id === x.stage);
  const viaCargo = isExternal(x.carrier);
  const carrier = carrierName(x.carrier);
  const delivered = x.stage === "entregado";
  const eta = x.eta ?? estimateDelivery(x.createdAt, rules);
  const first = (x.customer ?? "").split(" ")[0];
  const retiro = retiroLabel(rules);
  const web = company.website ? (/^https?:\/\//.test(company.website) ? company.website : `https://${company.website}`) : "";
  const handle = (company.instagram ?? "").trim();
  const insta = !handle ? "" : /^https?:\/\//.test(handle) ? handle : `https://www.instagram.com/${handle.replace(/^@/, "")}`;
  const ownWa = company.whatsapp || company.phone || "";
  const writeUs = ownWa ? waLink(ownWa, `Hola! Consulto por mi pedido ${x.orderRef || ""}`.trim()) : null;
  const driverWa = x.courierPhone ? waLink(x.courierPhone, `Hola${x.courier ? ` ${x.courier.split(" ")[0]}` : ""}! Soy ${first || "el cliente"}, consulto por mi pedido.`) : null;
  const items = (x.items ?? "").split(" · ").map((l) => l.trim()).filter(Boolean);

  const headline = delivered ? "¡Tu pedido fue entregado!" : problem ? (x.stage === "volvio" ? "Tu pedido volvió a nuestro depósito" : "No pudimos entregarte el pedido") : current?.name ? `Estado: ${current.name}` : "Tu pedido";
  const sub = delivered
    ? `${x.deliveredAt ? `Entregado el ${fdate(x.deliveredAt)}. ` : ""}Gracias por elegirnos.`
    : problem ? "Escribinos para coordinar una nueva entrega."
    : viaCargo ? `Lo enviamos por ${carrier}: el plazo de entrega depende del destino.`
    : `Entrega estimada: ${entregaLabel(eta)}, ${horarioLabel(rules)}.`;

  return (
    <main className="mx-auto max-w-xl px-4 py-6" style={{ fontFamily: fam(f.text), background: soft, minHeight: "100vh" }}>
      <link rel="stylesheet" href={fontsHref([f.title, f.text])} precedence="default" />
      <header className="mb-5 flex items-center justify-between border-b-2 pb-3" style={{ borderColor: accent }}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt={db.settings.name} className="max-h-9 w-auto max-w-[11rem] object-contain" /> : <p className="text-xl" style={{ color: accent, fontFamily: fam(f.title), fontWeight: fontBold(f.title) }}>{db.settings.name}</p>}
        <p className="text-xs text-gray-500">Seguimiento de pedido</p>
      </header>

      <p className="text-sm text-gray-600">Hola{first ? ` ${first}` : ""}!</p>
      <h1 className="mt-0.5 text-2xl leading-tight" style={{ fontFamily: fam(f.title), fontWeight: fontBold(f.title) }}>{headline}</h1>
      <p className="mt-1 text-sm text-gray-700">{sub}</p>

      {/* Etapas del pedido */}
      <ol className="mt-5 rounded-xl border bg-white p-4" style={{ borderColor: line }}>
        {flow.map((s, i) => {
          const done = delivered ? true : i < idx, now = !delivered && !problem && i === idx;
          return (
            <li key={s.id} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${done ? "border-transparent text-white" : now ? "bg-white" : "border-gray-300 bg-white text-gray-400"}`}
                  style={done ? { background: accent } : now ? { borderColor: accent, color: accent } : undefined}>{done ? CHECK : i + 1}</span>
                {i < flow.length - 1 && <span className="my-0.5 w-0.5 flex-1" style={{ background: done ? accent : "#e5e7eb", minHeight: 14 }} />}
              </div>
              <div className="pb-4">
                <p className={`text-sm ${now ? "font-semibold" : done ? "text-gray-800" : "text-gray-400"}`} style={now ? { color: accent } : undefined}>{s.name}{now && " (ahora)"}</p>
                {s.id === "en_viaje" && x.dispatchedAt && (done || now) && <p className="text-xs text-gray-500">Salió el {fdate(x.dispatchedAt)}</p>}
              </div>
            </li>
          );
        })}
        {problem && <li className="mt-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{current?.name}: coordinemos una nueva entrega por WhatsApp.</li>}
      </ol>

      {/* Entrega */}
      <section className="mt-4 rounded-xl border bg-white p-4 text-sm" style={{ borderColor: line }}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Entrega</h2>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-gray-500">Envío</dt><dd>{viaCargo ? `${carrier}${carrier === "Vía Cargo" ? " (interior del país)" : ""}` : carrier}</dd>
          {!viaCargo && !delivered && <><dt className="text-gray-500">Fecha estimada</dt><dd className="font-medium">{entregaLabel(eta)}, {horarioLabel(rules)}</dd></>}
          {isOwn(x.carrier) && !delivered && retiro && <><dt className="text-gray-500">Horario</dt><dd className="text-gray-700">El horario exacto depende del recorrido del chofer.</dd></>}
          {viaCargo && <><dt className="text-gray-500">Plazo</dt><dd>Depende del destino</dd></>}
          {viaCargo && x.tracking && <><dt className="text-gray-500">N.º de seguimiento</dt><dd className="font-mono font-semibold">{x.tracking}</dd></>}
          {x.address || x.city ? <><dt className="text-gray-500">Destino</dt><dd>{[x.address, x.city].filter(Boolean).join(", ")}</dd></> : null}
        </dl>
        {viaCargo && x.tracking && <p className="mt-2 text-xs text-gray-500">Con ese número podés consultar el estado en la web de {carrier}.</p>}
      </section>

      {/* Chofer */}
      {isOwn(x.carrier) && x.courier && (
        <section className="mt-4 rounded-xl border bg-white p-4 text-sm" style={{ borderColor: line }}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Quién te lo lleva</h2>
          <p className="text-base font-semibold">{x.courier || "Chofer de reparto"}</p>
          <p className="text-gray-600">{[x.vehicle, x.plate && `Patente ${x.plate.toUpperCase()}`].filter(Boolean).join(" · ")}</p>
          {x.courierPhone && <p className="mt-1 text-gray-700">Teléfono: {x.courierPhone}</p>}
          {driverWa && <a href={driverWa} className="mt-3 inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white" style={{ background: "#16a34a" }}>Escribirle por WhatsApp</a>}
        </section>
      )}

      {/* Pedido */}
      <section className="mt-4 rounded-xl border bg-white p-4 text-sm" style={{ borderColor: line }}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tu pedido</h2>
        {items.length ? <ul className="space-y-1.5">{items.map((l, i) => <li key={i} className="font-medium">{l}</li>)}</ul> : <p className="text-gray-500">Sin detalle de productos.</p>}
        <p className="mt-3 text-xs text-gray-500">{[x.orderRef && `Orden ${x.orderRef}`, `Compra del ${fdate(x.createdAt)}`, x.channel].filter(Boolean).join(" · ")}</p>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {writeUs && <a href={writeUs} className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-white" style={{ background: accent }}>Escribinos por WhatsApp</a>}
        {web && <a href={web} className="inline-flex h-10 items-center justify-center rounded-md border bg-white px-4 text-sm font-medium" style={{ borderColor: line }}>Tienda online</a>}
        {insta && <a href={insta} className="inline-flex h-10 items-center justify-center rounded-md border bg-white px-4 text-sm font-medium" style={{ borderColor: line }}>Instagram</a>}
      </div>
      <p className="mt-6 text-center text-xs text-gray-500">{db.settings.name} · Gracias por tu compra</p>
    </main>
  );
}
