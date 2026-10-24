import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import type { Informe } from "./informe";

type Doc = InstanceType<typeof PDFDocument>;
type Col = { label: string; w: number; align?: "left" | "right" | "center" };

const INK = "#0f172a", MUTED = "#64748b", LINE = "#e2e8f0", HEAD = "#f1f5f9", ACCENT = "#0a0a0a";
const M = 36, W = 595.28 - M * 2, BOTTOM = 842 - 48 - 14; // margen extra: pdfkit pasa de página si el texto queda al ras del borde

const num = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (n: number) => `$ ${num(n)}`;
const date = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

async function logoBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/image\/(png|jpe?g)/.test(type)) return null; // pdfkit solo lee PNG y JPG
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

/** Escribe una celda en una sola línea: recorta con "..." lo que no entra y alinea a mano (pdfkit parte el texto si se le da un ancho). */
function cell(doc: Doc, text: string, x: number, y: number, width: number, align: "left" | "right" | "center" = "left") {
  let t = text;
  if (doc.widthOfString(t) > width) {
    while (t.length > 1 && doc.widthOfString(`${t}...`) > width) t = t.slice(0, -1);
    t = `${t.trimEnd()}...`;
  }
  const w = doc.widthOfString(t);
  doc.text(t, align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x, y, { lineBreak: false });
}

function section(doc: Doc, title: string) {
  if (doc.y > BOTTOM - 70) doc.addPage();
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(M, y, W, 20).fill(ACCENT);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), M + 8, y + 5.5, { width: W - 16, lineBreak: false });
  doc.y = y + 26;
  doc.fillColor(INK);
}

/** Tabla con encabezado que se repite en cada página. `bold` marca filas de total. */
function table(doc: Doc, cols: Col[], rows: string[][], opts: { bold?: (i: number) => boolean; empty?: string } = {}) {
  const rowH = 17;
  const head = () => {
    const y = doc.y;
    doc.rect(M, y, W, rowH).fill(HEAD);
    let x = M;
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.5);
    for (const c of cols) { cell(doc, c.label.toUpperCase(), x + 4, y + 5, c.w - 8, c.align); x += c.w; }
    doc.y = y + rowH;
  };
  head();
  if (!rows.length) { doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(opts.empty ?? "Sin movimientos en el mes.", M + 4, doc.y + 5); doc.y += 22; doc.fillColor(INK); return; }
  rows.forEach((r, i) => {
    if (doc.y + rowH > BOTTOM) { doc.addPage(); head(); }
    const y = doc.y, bold = opts.bold?.(i) ?? false;
    if (bold) doc.rect(M, y, W, rowH).fill(HEAD);
    doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
    let x = M;
    doc.fillColor(INK).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    r.forEach((txt, k) => { cell(doc, txt, x + 4, y + 4.5, cols[k].w - 8, cols[k].align); x += cols[k].w; });
    doc.y = y + rowH;
  });
  doc.fillColor(INK);
}

/** Informe mensual en PDF para la contadora o el contador: resumen, ventas por canal y medio de pago, detalle de ventas y de gastos. */
export async function renderInformePdf(d: Informe): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: 48, left: M, right: M }, bufferPages: true, info: { Title: `Informe ${d.label} - ${d.company.name}`, Author: d.company.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  // Encabezado: logo (si es PNG/JPG), datos de la empresa y período
  const logo = await logoBuffer(d.company.logoUrl);
  const y = M;
  if (logo) { try { doc.image(logo, M, y, { fit: [120, 40] }); } catch { /* logo ilegible: se omite */ } }
  const left = logo ? M : M;
  const textY = logo ? y + 46 : y;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(logo ? 10 : 15).text(d.company.name, left, textY, { width: 300 });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  for (const line of [d.company.legalName, d.company.cuit && `CUIT ${d.company.cuit}`, d.company.holder && `Titular: ${d.company.holder}`, d.company.taxCondition, d.company.address, [d.company.phone, d.company.email].filter(Boolean).join(" - ")].filter(Boolean) as string[]) doc.text(line, left, doc.y, { width: 300 });
  const endLeft = doc.y;
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text("Informe mensual", M + 300, y, { width: W - 300, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(MUTED).text("Ventas, ingresos y gastos", M + 300, doc.y, { width: W - 300, align: "right" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(d.label, M + 300, doc.y + 4, { width: W - 300, align: "right" });
  doc.y = Math.max(doc.y, endLeft) + 4;
  doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(1.5).strokeColor(ACCENT).stroke();
  doc.y += 8;

  // Resumen
  section(doc, "Resumen del mes");
  const s = d.summary;
  table(doc, [{ label: "Concepto", w: W - 130 }, { label: "Importe", w: 130, align: "right" }], [
    [`Ventas realizadas (${s.count} operaciones, ${s.units} unidades)`, ""],
    ["Ingresos brutos", $(s.gross)],
    ["(-) Cargos, comisiones e impuestos de las plataformas", `- ${$(s.fees)}`],
    ["Ingresos netos cobrados", $(s.net)],
    ["(-) Gastos operativos del mes", `- ${$(s.operating)}`],
    ["Resultado del mes (neto menos gastos operativos)", $(s.result)],
    ["Compras de stock para kits (no se cuentan como gasto operativo)", $(s.kitStock)],
    ["Total de gastos y compras registrados", $(s.expenses)],
    ["Caja del mes (neto cobrado menos todo lo gastado)", $(s.cash)],
  ], { bold: (i) => [3, 5].includes(i) });
  if (s.cancelled || s.claims) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${s.cancelled ? `${s.cancelled} venta(s) cancelada(s) o reembolsada(s) no se suman. ` : ""}${s.claims ? `${s.claims} venta(s) con reclamo suman pero están a confirmar.` : ""}`, M, doc.y + 3);

  section(doc, "Ventas por canal");
  table(doc, [{ label: "Canal", w: W - 4 * 84 }, { label: "Ventas", w: 84, align: "right" }, { label: "Bruto", w: 84, align: "right" }, { label: "Cargos", w: 84, align: "right" }, { label: "Neto", w: 84, align: "right" }],
    [...d.byChannel.map((c) => [c.name, String(c.count), $(c.gross), $(c.fees), $(c.net)]), ...(d.byChannel.length ? [["Total", String(s.count), $(s.gross), $(s.fees), $(s.net)]] : [])], { bold: (i) => i === d.byChannel.length && d.byChannel.length > 0 });

  section(doc, "Ventas por forma de pago");
  table(doc, [{ label: "Forma de pago", w: W - 3 * 100 }, { label: "Ventas", w: 100, align: "right" }, { label: "Bruto", w: 100, align: "right" }, { label: "Neto", w: 100, align: "right" }],
    d.byPay.map((p) => [p.name, String(p.count), $(p.gross), $(p.net)]));

  section(doc, "Detalle de ventas");
  const sc: Col[] = [{ label: "N.º", w: 36 }, { label: "Fecha", w: 56 }, { label: "Canal", w: 64 }, { label: "Cliente", w: 80 }, { label: "Pago", w: 64 }, { label: "Bruto", w: 56, align: "right" }, { label: "Cargos", w: 48, align: "right" }, { label: "Neto", w: 56, align: "right" }, { label: "Estado", w: W - 460 }];
  table(doc, sc, d.sales.map((v) => [`V-${v.number}`, date(v.date), v.channel, v.customer, v.payMethod, num(v.gross), num(v.fees), num(v.net), v.status]), { empty: "No hubo ventas en el mes." });

  section(doc, "Gastos y compras por categoría");
  table(doc, [{ label: "Categoría", w: W - 190 }, { label: "Movimientos", w: 90, align: "right" }, { label: "Importe", w: 100, align: "right" }],
    [...d.expensesByCategory.map((c) => [c.name, String(c.count), $(c.amount)]), ...(d.expensesByCategory.length ? [["Total", String(d.expenses.length), $(s.expenses)]] : [])], { bold: (i) => i === d.expensesByCategory.length && d.expensesByCategory.length > 0 });

  section(doc, "Detalle de gastos y compras");
  table(doc, [{ label: "Fecha", w: 56 }, { label: "Categoría", w: 90 }, { label: "Descripción", w: W - 56 - 90 - 62 - 70 - 82 }, { label: "Tipo", w: 62 }, { label: "Pagó", w: 70 }, { label: "Importe", w: 82, align: "right" }],
    d.expenses.map((e) => [date(e.date), e.category, e.description, e.kind, e.paidBy, num(e.amount)]), { empty: "No hubo gastos en el mes." });

  doc.moveDown(1);
  if (doc.y > BOTTOM - 40) doc.addPage();
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("Los importes netos de Mercado Libre y Tienda Nube son los informados por cada plataforma o estimados a partir de sus cargos; conviene confirmarlos con los resúmenes de cuenta. Este informe es un resumen de gestión y no reemplaza a la facturación ni a la contabilidad.", M, doc.y, { width: W });

  // Pie de página con numeración
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`${d.company.name} - Informe de ${d.label} - Generado el ${date(d.generated)}`, M, 842 - 34, { width: W - 80, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, M + W - 80, 842 - 34, { width: 80, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
