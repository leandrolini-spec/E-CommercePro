// Datos DEMO en memoria. Se reemplazan por la base real (Supabase) sin cambiar las pantallas:
// las pantallas leen siempre a través de getDb() y las mutaciones pasan por actions.ts.
import { isoDaysAgo } from "@/lib/format";
import type { Db, Product, Sale, StockMovement } from "../types";

function seed(): Db {
  let n = 1;
  const id = (p: string) => `${p}${n++}`;
  let r = 7;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);

  const suppliers = [
    { id: "s1", name: "Distribuidora Norte", company: "Norte S.A.", phone: "11 5555-0101", email: "ventas@norte.example", cuit: "30-00000001-1", leadDays: 5, payTerms: "30 días" },
    { id: "s2", name: "Importadora Sur", company: "Sur Comercial S.R.L.", phone: "11 5555-0102", email: "pedidos@sur.example", cuit: "30-00000002-2", leadDays: 12, payTerms: "Contado" },
    { id: "s3", name: "Mayorista Centro", company: "Centro Hnos.", phone: "11 5555-0103", email: "info@centro.example", cuit: "30-00000003-3", leadDays: 3, payTerms: "15 días" },
  ];

  const P = (sku: string, name: string, category: string, brand: string, cost: number, price: number, min: number, max: number, supplierId: string): Product =>
    ({ id: id("p"), sku, name, category, brand, unit: "unidad", cost, price, minStock: min, maxStock: max, supplierId, active: true });
  const products: Product[] = [
    P("HOG-001", "Termo acero 1 L", "Hogar", "Marca A", 9000, 18500, 10, 60, "s1"),
    P("HOG-002", "Mate de calabaza", "Hogar", "Marca A", 3200, 7800, 15, 80, "s1"),
    P("TEC-001", "Auriculares inalámbricos", "Tecnología", "Marca B", 14000, 29900, 8, 40, "s2"),
    P("TEC-002", "Cargador rápido 20 W", "Tecnología", "Marca B", 4500, 11900, 20, 100, "s2"),
    P("TEC-003", "Soporte para celular", "Tecnología", "Marca C", 1800, 4900, 25, 120, "s2"),
    P("DEP-001", "Botella deportiva 750 ml", "Deportes", "Marca C", 2600, 6200, 20, 90, "s3"),
    P("DEP-002", "Banda elástica set x3", "Deportes", "Marca C", 3400, 7900, 12, 60, "s3"),
    P("HOG-003", "Organizador plegable", "Hogar", "Marca A", 5200, 5600, 10, 50, "s1"),
    P("OFI-001", "Cuaderno tapa dura A5", "Oficina", "Marca D", 1500, 3900, 30, 150, "s3"),
    P("OFI-002", "Lámpara de escritorio", "Oficina", "Marca D", 0, 12500, 6, 30, "s1"),
  ];

  const customers = [
    ["Lucía Fernández", "", "Buenos Aires", "Mercado Libre"], ["Martín Gómez", "Gómez y Asoc.", "Córdoba", "Recomendación"],
    ["Sofía Ramírez", "", "Rosario", "Instagram"], ["Diego Herrera", "Herrera Regalos", "Mendoza", "Web"],
    ["Valentina Díaz", "", "La Plata", "Mercado Libre"], ["Tomás Acosta", "Acosta Oficinas", "Buenos Aires", "Mercado Libre"],
    ["Camila Torres", "", "Tucumán", "Instagram"], ["Julián Ruiz", "", "Salta", "Mercado Libre"],
  ].map(([name, company, city, origin], i) => ({
    id: `c${i + 1}`, name, company, phone: `11 4444-01${10 + i}`, email: `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@ejemplo.com`,
    city, origin, createdAt: isoDaysAgo(120 - i * 12),
  }));

  const channels = ["Mercado Libre", "Venta directa", "Instagram", "Web"];
  const pay = ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta"];
  const statuses: Sale["status"][] = ["entregado", "entregado", "entregado", "entregado", "enviado", "preparando", "pendiente", "cancelada"];

  const movements: StockMovement[] = [];
  const mv = (productId: string, type: StockMovement["type"], qty: number, date: string, reason: string, ref?: string, unitCost?: number) =>
    movements.push({ id: id("m"), productId, type, qty, date, reason, ref, unitCost });

  const purchases = [
    { id: "b1", supplierId: "s1", date: isoDaysAgo(60), status: "recibida" as const, payMethod: "Transferencia", shipping: 12000, items: [{ productId: "p1", qty: 60, unitCost: 9000 }, { productId: "p2", qty: 70, unitCost: 3200 }, { productId: "p8", qty: 30, unitCost: 5200 }, { productId: "p10", qty: 12, unitCost: 0 }] },
    { id: "b2", supplierId: "s2", date: isoDaysAgo(58), status: "recibida" as const, payMethod: "Contado", shipping: 18000, items: [{ productId: "p3", qty: 30, unitCost: 14000 }, { productId: "p4", qty: 90, unitCost: 4500 }, { productId: "p5", qty: 100, unitCost: 1800 }] },
    { id: "b3", supplierId: "s3", date: isoDaysAgo(55), status: "recibida" as const, payMethod: "Transferencia", shipping: 6000, items: [{ productId: "p6", qty: 80, unitCost: 2600 }, { productId: "p7", qty: 40, unitCost: 3400 }, { productId: "p9", qty: 120, unitCost: 1500 }] },
    { id: "b4", supplierId: "s2", date: isoDaysAgo(3), status: "pendiente" as const, payMethod: "Contado", shipping: 9000, items: [{ productId: "p3", qty: 25, unitCost: 14000 }] },
    { id: "b5", supplierId: "s1", date: isoDaysAgo(1), status: "borrador" as const, payMethod: "Transferencia", shipping: 0, items: [{ productId: "p1", qty: 40, unitCost: 9200 }] },
  ];
  n = 100;
  for (const b of purchases.filter((b) => b.status === "recibida"))
    for (const it of b.items) mv(it.productId, "ingreso", it.qty, b.date, "Compra recibida", b.id, it.unitCost);

  const sales: Sale[] = [];
  let num = 1000;
  for (let d = 55; d >= 0; d--) {
    const count = rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < count; k++) {
      const status = d < 4 ? statuses[4 + Math.floor(rnd() * 4)] : statuses[Math.floor(rnd() * 4)];
      const lines = 1 + Math.floor(rnd() * 2);
      const items = Array.from({ length: lines }, () => {
        const p = products[Math.floor(rnd() * products.length)];
        return { productId: p.id, qty: 1 + Math.floor(rnd() * 3), unitPrice: p.price, discountPct: rnd() < 0.2 ? 10 : 0 };
      });
      const sale: Sale = {
        id: `v${++num}`, number: num, customerId: customers[Math.floor(rnd() * customers.length)].id, date: isoDaysAgo(d),
        channel: channels[Math.floor(rnd() * channels.length)], status, payMethod: pay[Math.floor(rnd() * pay.length)],
        extraCosts: Math.round((1500 + rnd() * 3500) / 100) * 100, items,
      };
      sales.push(sale);
      if (status === "enviado" || status === "entregado")
        for (const it of items) mv(it.productId, "egreso", -it.qty, sale.date, "Venta", `V-${sale.number}`);
    }
  }
  // Ajustes de ejemplo para que aparezcan alertas de stock
  mv("p3", "egreso", -22, isoDaysAgo(6), "Venta", "ajuste demo");
  mv("p6", "egreso", -68, isoDaysAgo(5), "Venta", "ajuste demo");
  mv("p9", "merma", -3, isoDaysAgo(9), "Mercadería dañada");

  const quotes = [
    { id: "q1", number: 1, customerId: "c2", date: isoDaysAgo(6), validUntil: isoDaysAgo(-9), status: "enviado" as const, discountPct: 5, taxPct: 21, items: [{ productId: "p3", qty: 10, unitPrice: 29900 }, { productId: "p4", qty: 10, unitPrice: 11900 }] },
    { id: "q2", number: 2, customerId: "c6", date: isoDaysAgo(20), validUntil: isoDaysAgo(5), status: "enviado" as const, discountPct: 0, taxPct: 21, items: [{ productId: "p9", qty: 50, unitPrice: 3900 }] },
    { id: "q3", number: 3, customerId: "c4", date: isoDaysAgo(12), validUntil: isoDaysAgo(-2), status: "aceptado" as const, discountPct: 8, taxPct: 21, items: [{ productId: "p1", qty: 20, unitPrice: 18500 }] },
    { id: "q4", number: 4, customerId: "c1", date: isoDaysAgo(1), validUntil: isoDaysAgo(-14), status: "borrador" as const, discountPct: 0, taxPct: 21, items: [{ productId: "p7", qty: 4, unitPrice: 7900 }] },
  ];

  const expenses = [
    ["Publicidad", "Campaña redes sociales", 85000], ["Logística", "Envíos del mes", 62000], ["Comisiones", "Comisiones de plataformas", 48000],
    ["Servicios", "Internet y telefonía", 21000], ["Packaging", "Cajas y cintas", 27500], ["Combustible", "Reparto local", 18000],
    ["Alquiler", "Depósito", 120000], ["Impuestos", "Monotributo", 34000],
  ].map(([category, description, amount], i) => ({
    id: `e${i + 1}`, date: isoDaysAgo(2 + i * 6), category: String(category), description: String(description), amount: Number(amount), payMethod: i % 2 ? "Transferencia" : "Efectivo",
  }));

  const cash = [
    { id: "k1", date: isoDaysAgo(50), type: "ingreso" as const, account: "Banco", concept: "Capital inicial", amount: 900000 },
    { id: "k2", date: isoDaysAgo(20), type: "ingreso" as const, account: "Mercado Pago", concept: "Liquidación de ventas", amount: 310000 },
    { id: "k3", date: isoDaysAgo(15), type: "egreso" as const, account: "Banco", concept: "Pago a proveedor", amount: 240000 },
    { id: "k4", date: isoDaysAgo(9), type: "ingreso" as const, account: "Efectivo", concept: "Ventas del mostrador", amount: 74000 },
    { id: "k5", date: isoDaysAgo(4), type: "egreso" as const, account: "Efectivo", concept: "Gastos varios", amount: 22000 },
  ];

  const opportunities = [
    ["Pedido corporativo de auriculares", "Acosta Oficinas", "Recomendación", 450000, "Presupuesto", 60, 9, "Enviar presupuesto ajustado"],
    ["Regalos empresariales", "Herrera Regalos", "Web", 280000, "Negociación", 75, 4, "Llamar para cerrar condiciones"],
    ["Compra recurrente de cuadernos", "Gómez y Asoc.", "Instagram", 120000, "Interesado", 40, 12, "Mandar muestras"],
    ["Consulta por mayor", "Lucía Fernández", "Mercado Libre", 90000, "Contactado", 25, 7, "Responder consulta de precios"],
    ["Lead de Instagram", "Camila Torres", "Instagram", 60000, "Nuevo", 10, 3, "Primer contacto"],
    ["Venta cerrada set deportivo", "Julián Ruiz", "Mercado Libre", 150000, "Ganado", 100, -3, "Coordinar entrega"],
    ["Cotización sin respuesta", "Valentina Díaz", "Mercado Libre", 70000, "Perdido", 0, -10, "—"],
  ].map((o, i) => ({
    id: `o${i + 1}`, name: String(o[0]), customerName: String(o[1]), origin: String(o[2]), value: Number(o[3]), stage: o[4] as Db["opportunities"][number]["stage"],
    probability: Number(o[5]), dueDate: isoDaysAgo(-Number(o[6])), nextAction: String(o[7]),
  }));

  return {
    settings: {
      name: "Mi negocio (DEMO)", currency: "ARS", country: "Argentina", mlSite: "MLA", taxPct: 21,
      channels, categories: ["Hogar", "Tecnología", "Deportes", "Oficina"], units: ["unidad", "caja", "kg", "litro"], payMethods: pay,
      expenseCategories: ["Logística", "Combustible", "Publicidad", "Comisiones", "Servicios", "Alquiler", "Packaging", "Herramientas", "Impuestos", "Administración", "Otros"],
      cogsCategories: [], costs: { logisticsPerShipment: 0, boxPerPack: 0, gncPct: 0 },
    },
    products, movements, suppliers, purchases: purchases as Db["purchases"], customers, sales, quotes, expenses, cash, opportunities, nextId: 10000, isDemo: true,
  };
}

import fs from "node:fs";
import path from "node:path";

// Persistencia provisoria en archivo (solo desarrollo local) hasta tener Supabase.
// data/store.json = datos de trabajo · data/seed.json = importación inicial.
const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "store.json");
const SEED = path.join(DATA_DIR, "seed.json");

function readJson(file: string): Db | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Db;
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __db?: Db };
export function getDb(): Db {
  return (g.__db ??= readJson(STORE) ?? readJson(SEED) ?? seed());
}
export function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(getDb()));
  } catch {
    // En producción el disco es de solo lectura: los datos reales irán a Supabase.
  }
}
export function nextId(prefix: string): string {
  const db = getDb();
  return `${prefix}${db.nextId++}`;
}
/** Vuelve a los datos importados del negocio (o al demo si no hay importación). */
export function resetToImported() {
  g.__db = readJson(SEED) ?? seed();
  persist();
}
export function loadDemo() {
  g.__db = seed();
  persist();
}
