import { Collapsible } from "@/components/shared/Collapsible";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, PageHeader } from "@/components/shared/list";
import { IconTrash } from "@/components/shared/icons";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, money, today } from "@/lib/format";
import { createMovement, deleteAdvance } from "@/modules/actions";
import { balance, sociedadDb } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { NEGOCIO, SOCIOS } from "@/modules/partners";

export default async function SociosPage() {
  const db = sociedadDb(await getDb());
  const moves = db.advances ?? [];
  const b = balance(db);
  // Un espacio por socio: los que ya tienen movimientos o figuran como quien pagó un gasto.
  const partners = [...new Set([...SOCIOS, ...db.expenses.map((e) => e.paidBy), ...moves.map((a) => a.partner)].filter((p) => p && p !== NEGOCIO))] as string[];
  const mine = (p: string) => moves.filter((a) => a.partner === p).sort((x, y) => y.date.localeCompare(x.date));
  const fields = [
    { name: "amount", label: "Monto", type: "currency" as const, required: true },
    { name: "date", label: "Fecha", type: "date" as const, defaultValue: today() },
    { name: "note", label: "Nota (opcional)", placeholder: "Ej: adelanto de octubre" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Socios" subtitle="Cuenta desde el 1/10/2026, cuando arrancó la sociedad. Cada socio anota lo que invierte y lo que retira. Los retiros se descuentan de los ingresos y no cuentan como gasto." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ingresos netos (ventas)" value={money(b.neto)} />
        <KpiCard label="Retiros de los socios" value={`− ${money(b.advances)}`} />
        <KpiCard label="Queda de los ingresos" value={money(b.neto - b.advances)} hint="Ingresos netos menos retiros" />
        <KpiCard label="Invertido por los socios" value={money(b.investments)} hint="Gastos que pagaron + inversiones anotadas" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {partners.map((p) => {
          const rows = mine(p);
          const porGastos = db.expenses.filter((e) => e.paidBy === p).reduce((s, e) => s + e.amount, 0);
          const aMano = rows.filter((r) => r.kind === "inversion").reduce((s, r) => s + r.amount, 0);
          const invirtio = porGastos + aMano;
          const retiro = rows.filter((r) => r.kind !== "inversion").reduce((s, r) => s + r.amount, 0);
          return (
            <section key={p} className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold">{p}</h2>
              <div className="my-3 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-success/10 p-3"><p className="text-xs uppercase tracking-wide text-muted">Invirtió</p><p className="text-xl font-semibold">{money(invirtio)}</p><p className="text-xs text-muted">Gastos pagados {money(porGastos)} + anotado {money(aMano)}</p></div>
                <div className="rounded-md bg-warning/10 p-3"><p className="text-xs uppercase tracking-wide text-muted">Retiró</p><p className="text-xl font-semibold">{money(retiro)}</p></div>
              </div>
              {(() => {
                const pagados = db.expenses.filter((e) => e.paidBy === p).sort((x, y) => y.date.localeCompare(x.date));
                return (
                  <details className="mb-3 rounded-md border border-line bg-bg/60 text-sm">
                    <summary className="cursor-pointer px-3 py-2 font-medium">Gastos que pagó ({pagados.length}) · salen solos de la pantalla Gastos</summary>
                    <ul className="divide-y divide-line px-3 pb-2">
                      {pagados.length === 0 && <li className="py-2 text-xs text-muted">Todavía no cargaron gastos a su nombre.</li>}
                      {pagados.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                          <span className="min-w-0 truncate"><span className="text-muted">{fdate(e.date)}</span> · {e.description}</span>
                          <span className="shrink-0 font-medium tabular-nums">{money(e.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })()}
              <div className="mb-3 flex flex-wrap gap-2">
                <CreateDrawer buttonLabel="Anotar inversión" title={`Inversión de ${p}`} variant="secondary" action={createMovement.bind(null, p, "inversion")} fields={fields} />
                <CreateDrawer buttonLabel="Anotar retiro" title={`Retiro de ${p}`} action={createMovement.bind(null, p, "retiro")} fields={fields} />
              </div>
              {rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">{p} todavía no tiene movimientos.</p>
              ) : (
                <DataTable
                  compact rows={rows} rowKey={(a) => a.id}
                  columns={[
                    { key: "d", header: "Fecha", render: (a) => <div className="space-y-1"><span className="block whitespace-nowrap">{fdate(a.date)}</span><Badge tone={a.kind === "inversion" ? "success" : "warning"}>{a.kind === "inversion" ? "Inversión" : "Retiro"}</Badge></div> },
                    {
                      // La nota se ordena sola: lo principal arriba y, si la escribieron con " - ", cada aclaración en su renglón.
                      key: "n", header: "Nota", render: (a) => {
                        const [main, ...details] = (a.note || "").split(/\s+[-–—]\s+/).map((t) => t.trim()).filter(Boolean);
                        return main ? (
                          <div className="text-xs leading-snug">
                            <p className="font-medium">{main}</p>
                            {details.map((d, i) => <p key={i} className="mt-0.5 text-muted">• {d}</p>)}
                          </div>
                        ) : "—";
                      },
                    },
                    { key: "m", header: "Monto", align: "right", render: (a) => <strong className="whitespace-nowrap tabular-nums">{money(a.amount)}</strong> },
                    { key: "x", header: "", render: (a) => <ActionButton action={deleteAdvance.bind(null, a.id)} label="Borrar" variant="secondary" iconOnly small icon={<IconTrash />} /> },
                  ]}
                />
              )}
            </section>
          );
        })}
        {(() => {
          // La caja es la plata del negocio: entra lo que se cobra de las ventas y sale lo que se pagó "del negocio" (o sin asignar a un socio) y lo que retiran los socios.
          const delNegocio = db.expenses.filter((e) => !e.paidBy || e.paidBy === NEGOCIO).sort((x, y) => y.date.localeCompare(x.date));
          const gastosCaja = delNegocio.reduce((s, e) => s + e.amount, 0);
          const salio = gastosCaja + b.advances;
          const queda = b.neto - salio;
          return (
            <section className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold">Caja del negocio</h2>
              <div className="my-3 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-success/10 p-3"><p className="text-xs uppercase tracking-wide text-muted">Entró</p><p className="text-xl font-semibold">{money(b.neto)}</p><p className="text-xs text-muted">Ingresos netos de ventas</p></div>
                <div className="rounded-md bg-warning/10 p-3"><p className="text-xs uppercase tracking-wide text-muted">Salió</p><p className="text-xl font-semibold">{money(salio)}</p><p className="text-xs text-muted">Gastos {money(gastosCaja)} + retiros {money(b.advances)}</p></div>
              </div>
              <div className="mb-3 rounded-md border border-line bg-bg/60 p-3 text-center">
                <p className="text-xs uppercase tracking-wide text-muted">Queda en la caja</p>
                <p className={`text-2xl font-semibold ${queda < 0 ? "text-danger" : ""}`}>{money(queda)}</p>
                <p className="text-xs text-muted">Ingresos netos menos gastos del negocio y retiros de los socios</p>
              </div>
              <Collapsible title={`Gastos pagados por el negocio (${delNegocio.length}) · salen solos de la pantalla Gastos`}>
                <ul className="divide-y divide-line px-3 pb-2">
                  {delNegocio.length === 0 && <li className="py-2 text-xs text-muted">Todavía no hay gastos pagados por el negocio.</li>}
                  {delNegocio.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate"><span className="text-muted">{fdate(e.date)}</span> · {e.description}</span>
                      <span className="shrink-0 font-medium tabular-nums">{money(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </section>
          );
        })()}
      </div>
      {partners.length === 0 && <p className="text-sm text-muted">Todavía no hay socios cargados.</p>}
    </div>
  );
}
