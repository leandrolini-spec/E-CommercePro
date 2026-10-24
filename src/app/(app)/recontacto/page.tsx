import { ActionButton, PageHeader } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { fdate, int, today } from "@/lib/format";
import { waLink } from "@/lib/contact";
import { getDb } from "@/modules/data";
import { contactedMap, recontactList, recontactMessage, RECONTACT_FROM_DAYS, RECONTACT_TO_DAYS, type RecontactRow } from "@/modules/recontact";
import { markRecontacted } from "@/modules/recontact-actions";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";
import { Guide } from "@/components/ui/Guide";

/** Clientes para volver a escribirles: pasaron 45 días o más desde su última compra. El mensaje lo mandás vos desde WhatsApp. */
export default async function RecontactoPage() {
  const db = await getDb();
  const contacted = isSupabase() ? await contactedMap(await activeProjectId()).catch(() => new Map<string, string>()) : new Map<string, string>();
  const { rows, noPhone } = recontactList(db, today(), contacted);
  return (
    <div className="space-y-4">
      <PageHeader title="Recontacto" subtitle={`Clientes que compraron hace entre ${RECONTACT_FROM_DAYS} y ${RECONTACT_TO_DAYS} días. El sistema arma la lista y el mensaje; lo mandás vos por WhatsApp y lo marcás como enviado.`} />
      <p className="text-center text-sm text-muted md:text-left"><strong className="text-ink">{int(rows.length)} cliente{rows.length === 1 ? "" : "s"}</strong> para escribirles{noPhone > 0 ? <> · {int(noPhone)} sin teléfono</> : null}.</p>
      <Guide title="¿Cómo funciona el recontacto?">
        Al marcar uno como enviado, sale de la lista por 30 días.{noPhone > 0 ? " Los que no tienen teléfono no se pueden contactar por WhatsApp: pedile el número en la próxima conversación." : ""}
      </Guide>
      <DataTable
        rows={rows} rowKey={(r) => r.customer.id} emptyTitle="Nadie para recontactar por ahora" emptyDescription="Cuando un cliente cumpla 45 días desde su última compra, aparece acá."
        columns={[
          { key: "n", header: "Cliente", render: (r: RecontactRow) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.customer.phone}</p></div> },
          { key: "c", header: "Localidad", render: (r: RecontactRow) => r.customer.city || "—" },
          { key: "p", header: "Compró", render: (r: RecontactRow) => <span className="block max-w-64 text-xs">{r.product || "—"}</span> },
          { key: "l", header: "Última compra", align: "center" as const, render: (r: RecontactRow) => fdate(r.last) },
          { key: "d", header: "Días", align: "center" as const, render: (r: RecontactRow) => int(r.days) },
          {
            key: "a", header: "", render: (r: RecontactRow) => (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <a href={waLink(r.customer.phone, recontactMessage(r.first)) ?? "#"} target="_blank" rel="noreferrer" title={recontactMessage(r.first)} className="inline-flex h-8 items-center rounded-md bg-[#16a34a] px-2.5 text-xs font-medium text-white hover:bg-[#15803d]">WhatsApp</a>
                <ActionButton action={markRecontacted.bind(null, r.customer.id)} label="Marcar enviado" />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
