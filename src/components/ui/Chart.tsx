"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { int, money } from "@/lib/format";

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
// Cada canal de venta tiene siempre el mismo color (igual que en Reportes).
const CHANNEL_COLORS: Record<string, string> = { "Mercado Libre": "#f59e0b", "Tienda Nube": "#2563eb", Instagram: "#db2777", WhatsApp: "#16a34a", "Campaña Meta": "#7c3aed", "Fuera de ML": "#64748b" };
const color = (label: string, i: number) => CHANNEL_COLORS[label] ?? (label === "Otros" || label === "Sin dato" ? "#94a3b8" : PIE_COLORS[i % (PIE_COLORS.length - 1)]);
const PIE_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#94a3b8"];

// Colores del dinero: lo que se mide (barras y líneas) va en verde; los bordes, los ejes y los números, en negro.
const GREEN = "#16a34a", INK = "#0a0a0a";

type Point = { label: string; value: number };

export function Chart({ data, type = "line", height = 240, format = "int", name = "Cantidad", color: accent = GREEN }: { data: Point[]; type?: "line" | "bar" | "pie"; height?: number; format?: "int" | "money" | "sales"; name?: string; /** Color de barras y líneas: verde en todo el CRM, el de la marca en Mercado Libre y Tienda Nube. */ color?: string }) {
  if (type === "pie") {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const fmt = (v: number) => (format === "money" ? money(v) : format === "sales" ? `${int(v)} ventas` : `${int(v)} u.`);
    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div style={{ height: 200 }} className="aspect-square w-full max-w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="95%" paddingAngle={2} stroke="none">
                {data.map((d, i) => <Cell key={i} fill={color(d.label, i)} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
          {data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color(d.label, i) }} />
              <span className="min-w-0 flex-1 truncate" title={d.label}>{d.label}</span>
              <span className="shrink-0 tabular-nums text-muted">{fmt(d.value)}</span>
              <span className="w-12 shrink-0 text-right font-medium tabular-nums">{((d.value / total) * 100).toFixed(0)} %</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid stroke="#e2e8f0" vertical={false} />
      <XAxis dataKey="label" stroke={INK} tick={{ fill: INK, fontSize: 12, fontWeight: 500 }} tickLine={false} axisLine={{ stroke: INK, strokeWidth: 1.2 }} />
      <YAxis stroke={INK} tick={{ fill: INK, fontSize: 12, fontWeight: 500 }} tickLine={false} axisLine={{ stroke: INK, strokeWidth: 1.2 }} width={56} allowDecimals={format === "money"} tickFormatter={(v) => compact.format(Number(v))} />
      <Tooltip formatter={(v) => (format === "money" ? money(Number(v)) : int(Number(v)))} />
    </>
  );
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" ? (
          <LineChart {...common}>{axes}<Line type="monotone" dataKey="value" name={name} stroke={accent} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: accent, stroke: INK, strokeWidth: 2 }} /></LineChart>
        ) : (
          <BarChart {...common}>{axes}<Bar dataKey="value" name={name} fill={accent} stroke={data.length > 40 ? "none" : INK} strokeWidth={1.2} radius={[4, 4, 0, 0]} /></BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
