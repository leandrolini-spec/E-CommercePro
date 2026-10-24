import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { IconPencil, IconWhatsApp } from "@/components/shared/icons";
import { waLink } from "@/lib/contact";
import { deliveryRules, horarioLabel, retiroLabel } from "@/modules/delivery";
import type { Db, Shipment } from "@/modules/types";
import { saveDriver } from "@/modules/settings-actions";
import { Guide } from "@/components/ui/Guide";

const btn = "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition max-md:h-auto max-md:min-h-9 max-md:w-full max-md:whitespace-normal max-md:py-2 max-md:text-center";

/** Chofer de reparto: sus datos se cargan y cambian acá (no en cada envío) y se habla con él por WhatsApp con un toque. */
export function DriverCard({ db, shipments }: { db: Db; shipments: Shipment[] }) {
  const c = db.settings.company ?? {};
  const first = (c.driverName ?? "").split(" ")[0];
  const rules = deliveryRules(c);
  const retiro = retiroLabel(rules);
  // Pedidos que hay que repartir: empaquetados y en viaje.
  const toDeliver = shipments.filter((x) => x.stage === "empaquetado" || x.stage === "en_viaje");
  // Un bloque por pedido, con espacio entre uno y otro (*texto* es negrita en WhatsApp).
  const block = (x: Shipment, i: number) => [
    `*${i + 1}. ${x.customer || "Cliente"}*`,
    `Dirección: ${[x.address, x.city].filter(Boolean).join(", ") || "sin dirección cargada"}`,
    x.phone ? `Teléfono: ${x.phone}` : "",
    ...(x.items ? x.items.split(" · ").map((l, k) => `${k === 0 ? "Productos:" : "                    "} ${l.trim()}`) : []),
    x.notes && x.notes.length <= 140 ? `Nota: ${x.notes.replace(/\s+/g, " ")}` : "",
  ].filter(Boolean).join("\n");
  const route = toDeliver.map(block).join("\n\n- - - - - - - - - - - -\n\n");
  const hello = waLink(c.driverPhone ?? "", `Hola${first ? ` ${first}` : ""}!`);
  const routeLink = toDeliver.length ? waLink(c.driverPhone ?? "", `Hola${first ? ` ${first}` : ""}!\nEstos son los pedidos para repartir (${toDeliver.length}):${retiro ? `\nRetiro de paquetes: ${retiro}.` : ""}\n\n- - - - - - - - - - - -\n\n${route}\n\n- - - - - - - - - - - -\nCualquier duda avisame. ¡Gracias!`) : null;
  const off = `${btn} cursor-not-allowed border-line bg-bg text-muted/60`;

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 max-md:flex-col max-md:text-center">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Chofer de reparto</h2>
          {c.driverName ? (
            <p className="mt-0.5 text-sm">
              <strong>{c.driverName}</strong>
              <span className="text-muted">{[c.driverVehicle, c.driverPlate && c.driverPlate.toUpperCase(), c.driverPhone].filter(Boolean).map((v) => ` · ${v}`).join("")}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">Cargá los datos del chofer: se anotan solos en cada envío que sale “En viaje”.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch">
          {hello ? <a href={hello} target="_blank" rel="noreferrer" title={`Escribirle a ${c.driverName} por WhatsApp`} className={`${btn} border-[#16a34a]/40 bg-[#16a34a]/10 text-[#15803d] hover:bg-[#16a34a]/20`}><IconWhatsApp />Hablar con el chofer</a> : <span title="Cargá el WhatsApp del chofer" className={off}><IconWhatsApp />Hablar con el chofer</span>}
          {routeLink ? <a href={routeLink} target="_blank" rel="noreferrer" title="Abre WhatsApp con la lista de pedidos para repartir" className={`${btn} border-primary bg-primary text-white hover:bg-primary-hover`}><IconWhatsApp />Mandar pedidos a repartir ({toDeliver.length})</a> : <span title={c.driverPhone ? "No hay pedidos empaquetados ni en viaje" : "Cargá el WhatsApp del chofer"} className={off}><IconWhatsApp />Mandar pedidos a repartir ({toDeliver.length})</span>}
          <CreateDrawer
            compact buttonLabel="Editar chofer" icon={<IconPencil />} variant="secondary" className="!h-9 !px-3.5 !text-sm max-md:!w-full" title="Chofer de reparto" action={saveDriver}
            fields={[
              { name: "driverName", label: "Nombre del chofer", defaultValue: c.driverName, placeholder: "Nombre y apellido", help: "Para quitar al chofer, dejá el nombre vacío y guardá: deja de figurar en los envíos en curso y en los mensajes." },
              { name: "driverActive", label: "¿Usar este chofer en los envíos y mensajes?", type: "select", defaultValue: c.driverActive ? "si" : "no", noBlank: true, help: "Si la logística no te dice quién entrega, dejalo en No: los datos quedan guardados por si los necesitás y los mensajes salen sin chofer.", options: [{ value: "no", label: "No, por ahora no lo uso" }, { value: "si", label: "Sí, anotarlo en cada envío que sale En viaje" }] },
              { name: "driverPhone", label: "WhatsApp", defaultValue: c.driverPhone, placeholder: "11 5555 5555", help: "Con el código de área, sin 0 ni 15." },
              { name: "driverVehicle", label: "Vehículo", defaultValue: c.driverVehicle, placeholder: "Kangoo blanca", half: true },
              { name: "driverPlate", label: "Patente", defaultValue: c.driverPlate, placeholder: "AB123CD", half: true },
            ]}
          />
        </div>
      </div>
      <Guide className="mt-3" title="¿Cómo funciona el reparto?"><p>{retiro ? <>La logística retira los paquetes <strong className="text-ink">{retiro}</strong> y reparte <strong className="text-ink">{horarioLabel(rules)}</strong>. </> : null}{c.driverActive ? "Cuando un pedido pasa a “En viaje”, se le anota este chofer y su vehículo. Si cambiás de chofer, los envíos que ya salieron conservan el que los llevó." : "El chofer está cargado pero sin usar: los envíos y los mensajes salen sin datos de chofer. Podés activarlo desde Editar chofer."} “Mandar pedidos a repartir” abre WhatsApp con la lista de lo empaquetado y en viaje (dirección, teléfono y productos); el mensaje lo mandás vos.</p></Guide>
    </section>
  );
}
