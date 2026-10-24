import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, money, today } from "@/lib/format";
import { createCashMovement } from "@/modules/actions";
import { getDb } from "@/modules/data";

const ACCOUNTS = ["Efectivo", "Banco", "Mercado Pago"];

export default async function CajaPage({ searchParams }: PageProps<"/caja">) {
  const sp = (await searchParams) as SearchParams;
  const db = (await getDb());
  const type = param(sp, "type"), account = param(sp, "account");
  const signed = (m: { type: string; amount: number }) => (m.type === "ingreso" ? m.amount : -m.amount);
  const filtered = [...db.cash].sort((a, b) => b.date.localeCompare(a.date)).filter((m) => (!type || m.type === type) && (!account || m.account === account));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const inc = filtered.filter((m) => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
  const out = filtered.filter((m) => m.type === "egreso").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Caja" subtitle="La caja es plata que entró y salió, distinta de la facturación y de la ganancia"
        actions={
          <CreateDrawer
            buttonLabel="Nuevo movimiento" title="Movimiento de caja" action={createCashMovement}
            fields={[
              { name: "date", label: "Fecha", type: "date", defaultValue: today() },
              { name: "type", label: "Tipo", type: "select", required: true, options: [{ value: "ingreso", label: "Ingreso" }, { value: "egreso", label: "Egreso" }] },
              { name: "account", label: "Cuenta", type: "select", required: true, options: ACCOUNTS.map((a) => ({ value: a, label: a })) },
              { name: "concept", label: "Concepto", required: true }, { name: "amount", label: "Importe", type: "currency", required: true },
            ]}
          />
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Saldo actual" value={money(db.cash.reduce((s, m) => s + signed(m), 0))} hint="Todas las cuentas" />
        {ACCOUNTS.map((a) => <KpiCard key={a} label={a} value={money(db.cash.filter((m) => m.account === a).reduce((s, m) => s + signed(m), 0))} />)}
      </section>
      <section className="grid grid-cols-3 gap-3 text-sm">
        <KpiCard label="Ingresos (filtro)" value={money(inc)} />
        <KpiCard label="Egresos (filtro)" value={money(out)} />
        <KpiCard label="Resultado (filtro)" value={money(inc - out)} />
      </section>
      <Filters sp={sp} searchPlaceholder="" filters={[
        { name: "type", label: "Tipo", options: [{ value: "ingreso", label: "Ingreso" }, { value: "egreso", label: "Egreso" }] },
        { name: "account", label: "Cuenta", options: ACCOUNTS },
      ]} />
      <DataTable
        rows={rows} rowKey={(m) => m.id}
        columns={[
          { key: "d", header: "Fecha", render: (m) => fdate(m.date) },
          { key: "c", header: "Concepto", render: (m) => m.concept },
          { key: "a", header: "Cuenta", render: (m) => m.account },
          { key: "t", header: "Tipo", render: (m) => <Badge tone={m.type === "ingreso" ? "success" : "danger"}>{m.type}</Badge> },
          { key: "m", header: "Importe", align: "right", render: (m) => <span className={m.type === "ingreso" ? "text-success" : "text-danger"}>{m.type === "ingreso" ? "+" : "−"} {money(m.amount)}</span> },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );
}
