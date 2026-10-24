import Link from "next/link";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { PageHeader } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/primitives";
import { fdate, int, today } from "@/lib/format";
import { waLink } from "@/lib/contact";
import { getDb } from "@/modules/data";
import { findGrower } from "@/modules/grower";
import { planOf, trayTable, type TrayRow } from "@/modules/trays";
import { registerPickup, saveTrayPlan } from "@/modules/trays-actions";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
const STATE: Record<TrayRow["state"], { label: string; tone: "danger" | "warning" | "success" | "neutral" }> = {
  reponer: { label: "Reponer ya", tone: "danger" }, justo: { label: "Alcanza justo", tone: "warning" }, ok: { label: "Hay", tone: "success" }, "sin-dato": { label: "Sin conteo", tone: "neutral" },
};

/** Abastecimiento de packs: cuántas conviene pedir al productor para el próximo retiro, según lo que se vende por semana. */
export default async function AbastecimientoPage() {
  const db = await getDb();
  const t = trayTable(db);
  const plan = planOf(db);
  const grower = findGrower(db);
  const lines = t.rows.filter((r) => r.suggest > 0).map((r) => `• ${r.name}: ${r.suggest}`);
  const msg = `Hola${grower?.name ? ` ${grower.name.split(/\s+/)[0]}` : ""}!\n\nPedido de packs para esta semana:\n${lines.join("\n")}\n\nTotal: ${t.total} packs.\n\n¡Gracias!`;
  const wa = grower?.phone && t.total > 0 ? waLink(grower.phone, msg) : null;
  const urgent = t.rows.filter((r) => r.state === "reponer");
  const cols = [
    { key: "n", header: "Pack", render: (r: TrayRow) => <span className="font-medium">{r.name}</span> },
    { key: "w", header: "Ventas por semana (últimas 4)", align: "center" as const, render: (r: TrayRow) => <span className="tabular-nums">{r.weekly.join(" · ")}</span> },
    { key: "a", header: "Promedio", align: "center" as const, render: (r: TrayRow) => fmt(r.avg) },
    { key: "c", header: "Vendidas sin entregar", align: "center" as const, render: (r: TrayRow) => int(r.committed) },
    { key: "s", header: "En mano (estimado)", align: "center" as const, render: (r: TrayRow) => (r.stock === null ? "—" : int(r.stock)) },
    { key: "d", header: "Alcanza para", align: "center" as const, render: (r: TrayRow) => (r.daysLeft === null ? "—" : r.daysLeft >= 99 ? "sin ventas" : `${fmt(Math.round(r.daysLeft * 10) / 10)} días`) },
    { key: "p", header: "Pedir", align: "center" as const, render: (r: TrayRow) => <strong className="text-base tabular-nums">{r.suggest}</strong> },
    { key: "e", header: "Estado", align: "center" as const, render: (r: TrayRow) => <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Abastecimiento" subtitle="Cuántas packs conviene pedir al productor para el próximo retiro, según lo que se vende por semana"
        actions={<>
          <CreateDrawer
            buttonLabel="Registrar retiro" title="Packs en mano" variant="secondary" action={registerPickup}
            fields={[
              { name: "date", label: "Fecha del retiro", type: "date", defaultValue: today(), help: "Desde esa fecha el sistema va restando lo que se vende." },
              ...t.rows.map((r) => ({ name: `q_${r.key}`, label: r.name, type: "number" as const, defaultValue: String(plan.stock?.counts[r.key] ?? 0), half: true })),
            ]}
          />
          <CreateDrawer
            buttonLabel="Ajustar plan" title="Plan de abastecimiento" variant="secondary" action={saveTrayPlan}
            fields={[
              { name: "capacity", label: "Capacidad semanal del productor (packs)", type: "number", required: true, defaultValue: String(plan.capacity) },
              { name: "buffer", label: "Margen de seguridad (%)", type: "number", required: true, defaultValue: String(plan.buffer), help: "Se pide este porcentaje por encima del promedio de ventas." },
            ]}
          />
          {wa
            ? <a href={wa} target="_blank" rel="noreferrer" title="Se abre WhatsApp con el pedido armado; el mensaje lo mandás vos" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover">Pedir al productor</a>
            : <span title={!grower?.phone ? "Falta el WhatsApp del productor: cargalo en Proveedores" : "No hay nada para pedir"} className="inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-line bg-bg px-3.5 text-sm font-medium text-muted/70">Pedir al productor</span>}
        </>}
      />
      {urgent.length > 0 && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">Reponer ya: {urgent.map((r) => r.name).join(", ")}. Con lo que hay en mano no alcanza para 3 días de ventas.</p>
      )}
      {!t.hasStock && (
        <p className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-muted">Todavía no registraste cuántas packs hay en mano. Tocá <strong className="text-ink">Registrar retiro</strong> cuando las recibas: así el sistema avisa cuándo reponer. Mientras tanto, el pedido sugerido es el promedio de ventas más el margen.</p>
      )}
      <p className="text-sm text-muted">
        Capacidad del productor: <strong className="text-ink">{plan.capacity} por semana</strong> · Margen de seguridad: <strong className="text-ink">{plan.buffer} %</strong>
        {t.hasStock && t.stockDate ? <> · Último conteo: <strong className="text-ink">{fdate(t.stockDate)}</strong></> : null}
        {t.capped ? <> · <strong className="text-warning">El pedido ideal supera la capacidad: se repartió en proporción.</strong></> : null}
      </p>
      <DataTable rows={t.rows} rowKey={(r) => r.key} columns={cols} />
      <p className="text-sm text-muted">
        Pedido sugerido para el próximo retiro: <strong className="text-ink">{t.total} packs</strong>. Las packs se retiran sin empacar y se empacan justo antes de cada reparto. El aviso es solo informativo: no cambia nada en Mercado Libre.
        {" "}<Link href="/envios" className="underline">Ver envíos</Link>
      </p>
    </div>
  );
}
