import { notFound } from "next/navigation";
import { Chart } from "@/components/ui/Chart";
import { DataTable } from "@/components/ui/DataTable";
import { Alert, Badge, Button, CurrencyInput, DatePicker, EmptyState, ErrorState, Field, Input, KpiCard, LoadingState, Select } from "@/components/ui/primitives";
import { ShowcaseOverlays } from "./ShowcaseOverlays";

// Galería de componentes para revisión visual. Solo en desarrollo; los datos son de muestra.
export default function UiShowcase() {
  if (process.env.NODE_ENV === "production") notFound();
  const chart = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label, i) => ({ label, value: [12, 19, 8, 24, 17, 30, 22][i] }));
  const rows = [
    { id: "1", name: "Producto de ejemplo A", stock: 4, state: "Stock bajo" },
    { id: "2", name: "Producto de ejemplo B", stock: 0, state: "Sin stock" },
    { id: "3", name: "Producto de ejemplo C", stock: 58, state: "Normal" },
  ];
  const tone = { "Stock bajo": "warning", "Sin stock": "danger", Normal: "success" } as const;
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Componentes</h1>
        <p className="text-sm text-muted">Galería de muestra (solo desarrollo). Los datos son ilustrativos.</p>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Facturación" value="$ 1.250.000" hint="Ejemplo" />
        <KpiCard label="Ventas" value="48" />
        <KpiCard label="Margen bruto" value="32 %" />
        <KpiCard label="Ticket promedio" value="$ 26.000" />
      </section>
      <section className="flex flex-wrap gap-2">
        <Button>Principal</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="danger">Eliminar</Button>
        <Button variant="ghost">Ghost</Button>
        <Badge tone="success">Completado</Badge>
        <Badge tone="warning">Advertencia</Badge>
        <Badge tone="danger">Crítico</Badge>
        <Badge tone="info">Info</Badge>
        <Badge>Neutro</Badge>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <Alert tone="danger" title="Pregunta sin responder">En la publicación de ejemplo.</Alert>
        <Alert tone="warning" title="Stock bajo">Quedan 4 unidades.</Alert>
      </section>
      <section className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-4">
        <Field label="Nombre"><Input placeholder="Texto" /></Field>
        <Field label="Categoría"><Select><option>Elegir…</option><option>Hogar</option></Select></Field>
        <Field label="Precio"><CurrencyInput defaultValue="1500" /></Field>
        <Field label="Fecha"><DatePicker /></Field>
      </section>
      <DataTable
        columns={[
          { key: "n", header: "Producto", render: (r) => r.name },
          { key: "s", header: "Stock", align: "right", render: (r) => r.stock },
          { key: "e", header: "Estado", render: (r) => <Badge tone={tone[r.state as keyof typeof tone]}>{r.state}</Badge> },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
      />
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-medium">Evolución de ventas</p>
          <Chart data={chart} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-medium">Unidades</p>
          <Chart data={chart} type="bar" />
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <EmptyState title="Sin productos" description="Cargá tu primer producto para empezar." />
        <LoadingState />
        <ErrorState description="No pudimos conectar con Mercado Libre." />
      </section>
      <ShowcaseOverlays />
    </div>
  );
}
