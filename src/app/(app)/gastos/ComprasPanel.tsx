import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { IconCheck, IconPencil } from "@/components/shared/icons";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, Filters, matches, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, type Tone } from "@/components/ui/primitives";
import { fdate, money, today } from "@/lib/format";
import { createPurchase, deletePurchase, receivePurchase, updatePurchase } from "@/modules/actions";
import { purchaseTotal } from "@/modules/calc";
import { expenseIdOf, PAYERS } from "@/modules/partners";
import type { Db, Purchase } from "@/modules/types";
import { rangeOf } from "@/components/shared/period";
import { SpendPanel } from "./SpendPanel";

const TONE: Record<string, Tone> = { borrador: "neutral", pendiente: "warning", recibida: "success", parcial: "info", cancelada: "danger" };

/** Compras: cada compra suma el stock y se anota sola en Gastos. Vive dentro de la pantalla Gastos (solapa Compras). */
export function ComprasPanel({ db, sp }: { db: Db; sp: SearchParams }) {
  const range = rangeOf(sp);
  const q = param(sp, "q"), status = param(sp, "status");
  const productF = param(sp, "product"), supplierF = param(sp, "supplier"), catF = param(sp, "category"), payerF = param(sp, "paidBy"), payF = param(sp, "payMethod");
  const expenseOf = (b: Purchase) => db.expenses.find((e) => e.id === expenseIdOf(b.id));
  const prodName = (id: string) => db.products.find((p) => p.id === id)?.name ?? "—";
  const sup = (id: string) => db.suppliers.find((s) => s.id === id)?.name ?? "—";
  // Compras = mercadería para vender (y piezas de kits). Los insumos de la empresa se cargan en la solapa Gastos.
  const isMerch = (b: Purchase) => b.items.every((i) => db.products.find((p) => p.id === i.productId)?.kind !== "consumible");
  const filtered = [...db.purchases.filter(isMerch)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((b) => matches(q, sup(b.supplierId), b.id, ...b.items.map((i) => prodName(i.productId))) && (!status || b.status === status) && b.date >= range.from && b.date <= range.to &&
      (!productF || b.items.some((i) => i.productId === productF)) && (!supplierF || b.supplierId === supplierF) &&
      (!catF || expenseOf(b)?.category === catF) && (!payerF || expenseOf(b)?.paidBy === payerF) && (!payF || b.payMethod === payF));
  const { rows, page, pages, total } = paginate(filtered, sp);
  const people = [...new Set([...PAYERS, ...db.expenses.map((e) => e.paidBy)].filter(Boolean))] as string[];

  const fieldsFor = (b?: Purchase) => {
    const it = b?.items[0], ex = b ? expenseOf(b) : undefined;
    return [
      { name: "supplierId", label: "Proveedor", type: "select" as const, required: true, defaultValue: b?.supplierId, options: db.suppliers.map((x) => ({ value: x.id, label: x.name })) },
      { name: "productId", label: "Producto", type: "select" as const, required: true, defaultValue: it?.productId, options: db.products.filter((p) => p.kind !== "consumible").map((p) => ({ value: p.id, label: p.name, dot: p.category || " " })) },
      { name: "date", label: "Fecha", type: "date" as const, defaultValue: b?.date ?? today() },
      { name: "qty", label: "Cantidad", type: "number" as const, required: true, defaultValue: it ? String(it.qty) : undefined },
      { name: "unitCost", label: "Costo unitario", type: "currency" as const, required: true, defaultValue: it ? String(it.unitCost) : undefined },
      { name: "shipping", label: "Transporte", type: "currency" as const, defaultValue: b ? String(b.shipping) : undefined },
      { name: "paidBy", label: "Quién pagó", type: "select" as const, defaultValue: ex?.paidBy, options: people.map((p) => ({ value: p, label: p })) },
      { name: "category", label: "Elegí una categoría", type: "category" as const, defaultValue: ex?.category ?? "Productos", suggestions: [...new Set([...db.settings.expenseCategories, ...db.expenses.map((x) => x.category), ...db.products.map((x) => x.category)].filter((c) => c && c.trim()))] },
      { name: "kitStock", label: "¿Es stock para kits?", type: "select" as const, defaultValue: ex ? (ex.kitStock ? "si" : "no") : undefined, options: [{ value: "si", label: "Sí" }, { value: "no", label: "No" }] },
      { name: "payMethod", label: "Forma de pago", type: "select" as const, defaultValue: b?.payMethod, options: db.settings.payMethods.map((m) => ({ value: m, label: m })) },
    ];
  };


  const detail = (
    <div className="space-y-4">
      <Filters sp={sp} dates searchPlaceholder="Buscar por producto o proveedor" filters={[
        { name: "product", label: "Producto", options: db.products.filter((p) => db.purchases.some((b) => b.items.some((i) => i.productId === p.id))).map((p) => ({ value: p.id, label: p.name })) },
        { name: "supplier", label: "Proveedor", options: db.suppliers.map((x) => ({ value: x.id, label: x.name })) },
        { name: "category", label: "Categoría", options: db.settings.expenseCategories },
        { name: "paidBy", label: "Quién pagó", options: people },
        { name: "payMethod", label: "Forma de pago", options: db.settings.payMethods },
        { name: "status", label: "Estado", options: ["borrador", "pendiente", "recibida", "parcial", "cancelada"] },
      ]} />
      <DataTable
        compact
        rows={rows} rowKey={(b) => b.id}
        columns={[
          { key: "d", header: "Fecha", render: (b) => fdate(b.date) },
          { key: "s", header: "Proveedor", render: (b) => sup(b.supplierId) },
          { key: "i", header: "Productos", render: (b) => b.items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)?.name}`).join(", ") },
          { key: "sh", header: "Transporte", align: "right", render: (b) => money(b.shipping) },
          { key: "t", header: "Costo final", align: "right", render: (b) => money(purchaseTotal(b)) },
          { key: "pg", header: "Pagó", render: (b) => (expenseOf(b)?.paidBy ? <Badge tone="success" fixed>{expenseOf(b)!.paidBy}</Badge> : <span className="text-muted">—</span>) },
          { key: "cg", header: "Categoría", render: (b) => (expenseOf(b)?.category ? <CategoryBadge name={expenseOf(b)!.category} /> : "—") },
          { key: "st", header: "Estado", render: (b) => <Badge tone={TONE[b.status]} fixed>{b.status}</Badge> },
          {
            key: "a", header: "", render: (b) => (
              <div className="flex items-center justify-end gap-1">
                {(b.status === "pendiente" || b.status === "borrador" || b.status === "parcial") && <ActionButton action={receivePurchase.bind(null, b.id)} label="Marcar como recibida" iconOnly small icon={<IconCheck />} />}
                <CreateDrawer compact iconOnly icon={<IconPencil />} buttonLabel="Editar compra" title="Editar compra" variant="secondary" action={updatePurchase.bind(null, b.id)} fields={fieldsFor(b)} />
                <ConfirmActionButton action={deletePurchase.bind(null, b.id)} label="Eliminar compra" message="¿Eliminar esta compra? Esta acción no se puede deshacer." icon medium />
              </div>
            ),
          },
        ]}
      />
      <Pager sp={sp} page={page} pages={pages} total={total} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateDrawer buttonLabel="Nueva compra" title="Nueva compra" action={createPurchase} fields={fieldsFor()} />
      </div>
      <SpendPanel mode="compras" db={db} sp={sp} detail={detail} />
    </div>
  );
}
