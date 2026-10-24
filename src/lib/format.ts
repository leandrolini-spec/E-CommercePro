const money0 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("es-AR");

/** Importe exacto: sin decimales si es entero y con 2 decimales si no lo es (no se redondea a pesos enteros). */
export const money = (n: number) => (Math.abs(n - Math.round(n)) < 0.005 ? money0.format(Math.round(n)) : money2.format(n));
export const int = (n: number) => num.format(n);
export const pct = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

/** Fecha (AAAA-MM-DD) en hora de Argentina: el servidor corre en UTC y de noche ya marcaría "mañana". */
export const isoDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
export const isoDaysAgo = (d: number) => isoDate(Date.now() - d * 86400000);
export const today = () => isoDaysAgo(0);

export function fdate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
