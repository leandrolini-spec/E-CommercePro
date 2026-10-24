import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { IconPencil } from "@/components/shared/icons";
import Link from "next/link";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { Filters, matches, PageHeader, paginate, Pager, param, type SearchParams } from "@/components/shared/list";
import { hrefWith, inRangeDb, PeriodTabs, rangeOf } from "@/components/shared/period";
import { DataTable } from "@/components/ui/DataTable";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { fdate, int, money, today } from "@/lib/format";
import { createExpense, deleteExpense, updateExpense } from "@/modules/actions";
import { balance, sociedadDb } from "@/modules/calc";
import { getDb } from "@/modules/data";
import { expenseIdOf, PAYERS } from "@/modules/partners";
import { defaultExpenseKind, EXPENSE_KINDS } from "@/modules/expenses";
import { ComprasPanel } from "./ComprasPanel";
import { SpendPanel } from "./SpendPanel";

export default async function GastosPage({ searchParams }: PageProps<"/gastos">) {
  const sp = (await searchParams) as SearchParams;
  const db = (await getDb());
  const tab = param(sp, "tab") === "compras" ? "compras" : param(sp, "tab") === "insumos" ? "insumos" : "gastos";
  const range = rangeOf(sp);
  const q = param(sp, "q"), cat = param(sp, "category"), who = param(sp, "paidBy"), kind = param(sp, "kind"), tipo = param(sp, "tipo"), productF = param(sp, "product");
  // Todas las categorías que existen: las de Configuración, las de los gastos cargados y las de los productos.
  const allCategories = [...new Set([...db.settings.expenseCategories, ...db.expenses.map((x) => x.category), ...db.products.map((x) => x.category)].filter((c) => c && c.trim()))];
  const forSale = db.products.filter((p) => (p.kind ?? "venta") === "venta" && !p.name.startsWith("Compras varias"));
  const people = [...new Set([...PAYERS, ...db.expenses.map((e) => e.paidBy).filter(Boolean)])] as string[];
  // Gastos = todo lo que se paga. Según su tipo se replica solo: lo "para vender" en Compras y los insumos de la empresa en Insumos de la empresa.
  // Gastos que vienen de una compra de un producto (para filtrar por producto).
  const expenseIdsOfProduct = new Set(productF ? db.purchases.filter((b) => b.items.some((i) => i.productId === productF)).map((b) => expenseIdOf(b.id)) : []);
  const productName = db.products.find((p) => p.id === productF)?.name ?? "";
  // Todo lo que se ve depende del mismo período y de los mismos filtros: la lista, las tarjetas y el balance.
  const base = [...db.expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(
      (e) =>
        matches(q, e.description, e.category, e.paidBy) && (!cat || e.category === cat) && (!who || (who === "—" ? !e.paidBy : e.paidBy === who)) &&
        (!kind || (kind === "kits" ? e.kitStock : !e.kitStock)) && e.date >= range.from && e.date <= range.to &&
        (!productF || expenseIdsOfProduct.has(e.id) || (!!productName && e.description.toLowerCase().includes(productName.toLowerCase()))),
    );
  const filtered = base.filter((e) => !tipo || (e.kind ?? defaultExpenseKind(e.category)) === tipo);
  const { rows, page, pages, total } = paginate(filtered, sp);
  const sociedad = sociedadDb(db);
  const b = balance(inRangeDb(sociedad, range.from, range.to));
  const tabHref = (k: string) => hrefWith({ ip: param(sp, "ip"), from: param(sp, "from"), to: param(sp, "to"), product: param(sp, "product") }, { tab: k === "gastos" ? "" : k });

  const fieldsFor = (e?: (typeof db.expenses)[number]) => [
    { name: "description", label: "Artículo", required: true, defaultValue: e?.description },
    { name: "quantity", label: "Cantidad", type: "number" as const, defaultValue: String(e?.quantity ?? 1) },
    { name: "amount", label: "Total pagado", type: "currency" as const, required: true, defaultValue: e ? String(e.amount) : undefined },
    { name: "date", label: "Fecha", type: "date" as const, defaultValue: e?.date ?? today() },
    { name: "paidBy", label: "Quién pagó", type: "select" as const, defaultValue: e?.paidBy, options: people.map((p) => ({ value: p, label: p })) },
    { name: "category", label: "Elegí una categoría", type: "category" as const, required: true, defaultValue: e?.category, suggestions: allCategories },
    { name: "kind", label: "Tipo de gasto (vacío = según la categoría)", type: "select" as const, defaultValue: e?.kind ?? "", options: EXPENSE_KINDS.map((k) => ({ value: k.value, label: k.label })) },
    { name: "productId", label: "¿Qué producto es?", type: "select" as const, defaultValue: "", placeholder: "Ninguno (compra varia)", help: "Solo si es para vender: suma stock", options: forSale.map((p) => ({ value: p.id, label: p.name, dot: p.category || " " })) },
    { name: "payMethod", label: "Forma de pago", type: "select" as const, defaultValue: e?.payMethod, options: db.settings.payMethods.map((m) => ({ value: m, label: m })) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gastos y compras" subtitle={tab === "compras" ? "Lo que cargás como gasto “para vender” aparece acá solo y suma stock" : tab === "insumos" ? "Lo que cargás como gasto de la empresa aparece acá solo, con su análisis por período" : "Cargá todo acá: según su tipo, se replica solo en Compras o en Insumos de la empresa"}
        actions={tab === "gastos" ? (
          <CreateDrawer
            buttonLabel="Nuevo gasto" title="Nuevo gasto" action={createExpense}
            fields={fieldsFor()}
          />
        ) : undefined}
      />
      <nav className="flex gap-1.5" aria-label="Sección">
        {([["gastos", "Gastos"], ["compras", "Compras"], ["insumos", "Insumos de la empresa"]] as const).map(([k, label]) => (
          <Link key={k} href={tabHref(k)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      <PeriodTabs sp={sp} />
      {tab === "compras" ? <ComprasPanel db={db} sp={sp} /> : tab === "insumos" ? <SpendPanel mode="insumos" db={db} sp={sp} /> : (
        <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EXPENSE_KINDS.map((k) => {
          const total = base.filter((e) => (e.kind ?? defaultExpenseKind(e.category)) === k.value).reduce((a, e) => a + e.amount, 0);
          return (
            <div key={k.value} className="rounded-lg border border-line bg-surface p-4" style={{ borderLeft: `4px solid ${k.color}` }}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{k.short}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{money(total)}</p>
              <p className="mt-1 text-xs text-muted">{k.value === "venta" ? "Va a la solapa Compras" : k.value === "insumo" ? "Va a Insumos de la empresa" : "Servicios, dominio, contador…"}</p>
            </div>
          );
        })}
        <div className="rounded-lg border border-line bg-bg p-4" style={{ borderLeft: "4px solid #0f172a" }}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total gastado</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{money(filtered.reduce((a, e) => a + e.amount, 0))}</p>
          <p className="mt-1 text-xs text-muted">{range.label}</p>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ingresos" value={money(b.bruto)} hint={`Ventas · ${range.label}`} />
        <KpiCard label="Impuestos y comisiones" value={`− ${money(b.fees)}`} hint="Lo que descuenta Mercado Libre" />
        <KpiCard label="Gastos" value={`− ${money(b.gastos)}`} hint="Todo lo que se pagó" />
        <KpiCard label="Balance" value={money(b.bruto - b.fees - b.gastos)} hint="Ingresos − impuestos − gastos" />
      </section>
      <Filters sp={sp} dates searchPlaceholder="Buscar por artículo, categoría o quién pagó" filters={[
        { name: "product", label: "Producto", options: db.products.filter((p) => db.purchases.some((x) => x.items.some((i) => i.productId === p.id))).sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: p.name })) },
        { name: "category", label: "Categoría", options: allCategories },
        { name: "paidBy", label: "Quién pagó", options: [...people, "—"] },
        { name: "tipo", label: "Tipo de gasto", options: EXPENSE_KINDS.map((k) => ({ value: k.value, label: k.short })) },
      ]} />
      <DataTable
        compact
        rows={rows} rowKey={(e) => e.id} emptyTitle="Sin gastos" emptyDescription="Cargá el primero con “Nuevo gasto”."
        columns={[
          { key: "d", header: "Fecha", render: (e) => fdate(e.date) },
          { key: "de", header: "Artículo", render: (e) => <p className="min-w-40 font-medium leading-snug">{e.description}</p> },
          { key: "cat", header: "Categoría", render: (e) => <CategoryBadge name={e.category} /> },
          {
            key: "tipo", header: "Tipo de gasto", render: (e) => {
              const k = EXPENSE_KINDS.find((x) => x.value === (e.kind ?? defaultExpenseKind(e.category)));
              return (
                <span className="inline-flex h-6 w-40 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: k?.color ?? "#94a3b8" }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />{k?.short ?? "Sin tipo"}
                </span>
              );
            },
          },
          { key: "q", header: "Cant.", align: "right", render: (e) => int(e.quantity ?? 1) },
          { key: "u", header: "Precio c/u", align: "right", render: (e) => ((e.quantity ?? 1) > 1 ? money(e.amount / (e.quantity ?? 1)) : "—") },
          { key: "p", header: "Pagó", render: (e) => (e.paidBy ? <Badge tone="success" fixed>{e.paidBy}</Badge> : <Badge tone="warning" fixed>Falta quién pagó</Badge>) },
          { key: "a", header: "Total", align: "right", render: (e) => money(e.amount) },
          {
            key: "x", header: "", render: (e) => (
              <div className="flex items-center justify-end gap-1">
                <CreateDrawer compact iconOnly icon={<IconPencil />} buttonLabel="Editar gasto" title="Editar gasto" variant="secondary" action={updateExpense.bind(null, e.id)} fields={fieldsFor(e)} />
                <ConfirmActionButton action={deleteExpense.bind(null, e.id)} label="Eliminar gasto" message={`¿Eliminar este gasto de ${money(e.amount)}? Esta acción no se puede deshacer.`} icon medium />
              </div>
            ),
          },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success">
        <p className="text-sm font-semibold uppercase tracking-wide">Total de lo filtrado <span className="ml-2 font-normal normal-case opacity-80">{int(filtered.length)} gasto{filtered.length === 1 ? "" : "s"} · {int(filtered.reduce((a, e) => a + (e.quantity ?? 1), 0))} unidades</span></p>
        <p className="text-xl font-bold tabular-nums">{money(filtered.reduce((a, e) => a + e.amount, 0))}</p>
      </div>
      <Pager sp={sp} page={page} pages={pages} total={total} />
        </>
      )}
    </div>
  );
}
