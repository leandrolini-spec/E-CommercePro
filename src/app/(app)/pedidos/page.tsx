import { ActionButton, PageHeader } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { fdate, money } from "@/lib/format";
import { advanceSale } from "@/modules/actions";
import { saleTotals } from "@/modules/calc";
import { getDb } from "@/modules/data";
import type { SaleStatus } from "@/modules/types";

const COLUMNS: { status: SaleStatus; label: string; next?: string }[] = [
  { status: "pendiente", label: "Pendientes", next: "Preparar" },
  { status: "preparando", label: "En preparación", next: "Marcar enviado" },
  { status: "enviado", label: "Enviados", next: "Marcar entregado" },
];
const TONE: Record<string, Tone> = { pendiente: "warning", preparando: "info", enviado: "info" };

export default async function PedidosPage() {
  const db = (await getDb());
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? "—";
  const open = db.sales.filter((s) => COLUMNS.some((c) => c.status === s.status)).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <PageHeader title="Pedidos" subtitle="Ventas que todavía no se entregaron. Al marcar enviado se descuenta el stock." />
      {open.length === 0 ? (
        <EmptyState title="No hay pedidos abiertos" description="Cuando registres una venta, aparece acá hasta que se entregue." />
      ) : (
        <DataTable
          rows={open} rowKey={(s) => s.id}
          columns={[
            { key: "n", header: "N.º", render: (s) => `V-${s.number}` },
            { key: "d", header: "Fecha", render: (s) => fdate(s.date) },
            { key: "c", header: "Cliente", render: (s) => cust(s.customerId) },
            { key: "ch", header: "Canal", render: (s) => s.channel },
            { key: "i", header: "Productos", render: (s) => s.items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)?.name}`).join(", ") },
            { key: "t", header: "Total", align: "right", render: (s) => money(saleTotals(db, s).revenue) },
            { key: "st", header: "Estado", render: (s) => <Badge tone={TONE[s.status]}>{s.status}</Badge> },
            { key: "a", header: "", render: (s) => <ActionButton action={advanceSale.bind(null, s.id)} label={COLUMNS.find((c) => c.status === s.status)?.next ?? ""} variant="primary" /> },
          ]}
        />
      )}
      <section className="grid grid-cols-3 gap-3 text-sm">
        {COLUMNS.map((c) => (
          <div key={c.status} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-muted">{c.label}</p>
            <p className="text-xl font-semibold">{open.filter((s) => s.status === c.status).length}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
