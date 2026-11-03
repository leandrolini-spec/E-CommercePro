// Datos DEMO completos y ficticios para mostrar el CRM entero (Mercado Libre, Tienda Nube, envíos, stock, gastos…).
// Todo es inventado: ningún nombre, teléfono ni dirección es real. Se genera de forma determinista y con fechas relativas a hoy.
// Para volar los datos: Configuración → Sistema (restaurar) o borrar data/store.json.
import { isoDaysAgo } from "@/lib/format";
import type { Customer, Db, Expense, Product, Sale, Shipment, StockMovement } from "../types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function seed(): Db {
  let r = 11;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  let n = 1;
  const id = (p: string) => `${p}${n++}`;

  const suppliers = [
    { id: "s1", name: "Distribuidora Norte", company: "Norte S.A.", phone: "11 5555-0101", email: "ventas@norte.example", cuit: "30-00000001-1", leadDays: 5, payTerms: "30 días", contactName: "Marcela Ibáñez", category: "Productos", city: "San Martín, Buenos Aires" },
    { id: "s2", name: "Importadora Sur", company: "Sur Comercial S.R.L.", phone: "11 5555-0102", email: "pedidos@sur.example", cuit: "30-00000002-2", leadDays: 12, payTerms: "Contado", contactName: "Gustavo Peralta", category: "Productos", city: "Avellaneda, Buenos Aires" },
    { id: "s3", name: "Mayorista Centro", company: "Centro Hnos.", phone: "11 5555-0103", email: "info@centro.example", cuit: "30-00000003-3", leadDays: 3, payTerms: "15 días", contactName: "Silvia Montes", category: "Productos", city: "Once, CABA" },
    { id: "s4", name: "Embalajes del Plata", company: "Del Plata Packaging", phone: "11 5555-0104", email: "hola@delplata.example", cuit: "30-00000004-4", leadDays: 2, payTerms: "Contado", contactName: "Ramiro Vega", category: "Embalaje", city: "Quilmes, Buenos Aires" },
  ];

  const P = (sku: string, name: string, category: string, brand: string, cost: number, price: number, min: number, max: number, supplierId: string, tn: Product["listings"] | null): Product => ({
    id: id("p"), sku, name, category, brand, unit: "unidad", cost, price, minStock: min, maxStock: max, supplierId, active: true, kind: "venta",
    listings: tn ?? undefined,
  });
  const tnL = (name: string, price: number, status: "active" | "out_of_stock" | "paused" = "active") => [{ channel: "Tienda Nube", status, price, url: `https://tu-tienda.com/productos/${slug(name)}` }];
  const products: Product[] = [
    P("HOG-001", "Termo acero 1 L", "Hogar", "Marca A", 9000, 18500, 10, 60, "s1", tnL("Termo acero 1 L", 18500)),
    P("HOG-002", "Mate de calabaza", "Hogar", "Marca A", 3200, 7800, 15, 80, "s1", tnL("Mate de calabaza", 7800)),
    P("TEC-001", "Auriculares inalámbricos", "Tecnología", "Marca B", 14000, 29900, 8, 40, "s2", tnL("Auriculares inalámbricos", 29900)),
    P("TEC-002", "Cargador rápido 20 W", "Tecnología", "Marca B", 4500, 11900, 20, 100, "s2", tnL("Cargador rápido 20 W", 11900)),
    P("TEC-003", "Soporte para celular", "Tecnología", "Marca C", 1800, 4900, 25, 120, "s2", tnL("Soporte para celular", 4900, "out_of_stock")),
    P("DEP-001", "Botella deportiva 750 ml", "Deportes", "Marca C", 2600, 6200, 20, 90, "s3", tnL("Botella deportiva 750 ml", 6200)),
    P("DEP-002", "Banda elástica set x3", "Deportes", "Marca C", 3400, 7900, 12, 60, "s3", tnL("Banda elástica set x3", 7900, "paused")),
    P("HOG-003", "Organizador plegable", "Hogar", "Marca A", 5200, 9600, 10, 50, "s1", tnL("Organizador plegable", 9600)),
    P("OFI-001", "Cuaderno tapa dura A5", "Oficina", "Marca D", 1500, 3900, 30, 150, "s3", tnL("Cuaderno tapa dura A5", 3900)),
    P("OFI-002", "Lámpara de escritorio", "Oficina", "Marca D", 5500, 12500, 6, 30, "s1", tnL("Lámpara de escritorio", 12500)),
    P("HOG-004", "Set de ollas antiadherentes", "Hogar", "Marca E", 21000, 45900, 5, 30, "s1", tnL("Set de ollas antiadherentes", 45900)),
    P("DEP-003", "Mochila deportiva 25 L", "Deportes", "Marca C", 8200, 17900, 8, 40, "s3", tnL("Mochila deportiva 25 L", 17900)),
    P("TEC-004", "Parlante bluetooth", "Tecnología", "Marca B", 12500, 27900, 8, 40, "s2", tnL("Parlante bluetooth", 27900)),
    P("OFI-003", "Organizador de escritorio", "Oficina", "Marca D", 3800, 8900, 10, 60, "s3", null),
  ];
  // Un producto con más rotación que el resto (los primeros se venden más).
  const weights = [10, 9, 8, 9, 7, 7, 4, 4, 5, 3, 2, 4, 6, 2];
  const pickProduct = () => {
    let x = rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < products.length; i++) { x -= weights[i]; if (x <= 0) return products[i]; }
    return products[0];
  };

  // ───────── Clientes ─────────
  const PROV = ["Buenos Aires", "CABA", "Córdoba", "Santa Fe", "Mendoza", "Tucumán", "Salta", "Entre Ríos", "Neuquén", "Chubut"];
  const PLACES: [string, string][] = [
    ["Lomas de Zamora", "Buenos Aires"], ["Palermo", "CABA"], ["La Plata", "Buenos Aires"], ["Rosario", "Santa Fe"], ["Córdoba Capital", "Córdoba"], ["Mendoza Capital", "Mendoza"],
    ["San Miguel de Tucumán", "Tucumán"], ["Quilmes", "Buenos Aires"], ["Caballito", "CABA"], ["Mar del Plata", "Buenos Aires"], ["Salta Capital", "Salta"], ["Paraná", "Entre Ríos"],
    ["Neuquén Capital", "Neuquén"], ["Morón", "Buenos Aires"], ["Villa Crespo", "CABA"], ["Trelew", "Chubut"], ["Pilar", "Buenos Aires"], ["Godoy Cruz", "Mendoza"],
  ];
  void PROV;
  const FIRST = ["Lucía", "Martín", "Sofía", "Diego", "Valentina", "Tomás", "Camila", "Julián", "Florencia", "Nicolás", "Agustina", "Facundo", "Micaela", "Matías", "Romina", "Sebastián", "Carolina", "Gonzalo", "Paula", "Ezequiel", "Natalia", "Ramiro", "Belén", "Leandro", "Candela", "Federico", "Daniela", "Maximiliano", "Victoria", "Joaquín"];
  const LAST = ["Fernández", "Gómez", "Ramírez", "Herrera", "Díaz", "Acosta", "Torres", "Ruiz", "Sosa", "Medina", "Romero", "Álvarez", "Castro", "Ortiz", "Silva", "Rojas", "Molina", "Suárez", "Benítez", "Núñez"];
  const STREETS = ["Av. Rivadavia", "Mitre", "San Martín", "Belgrano", "Sarmiento", "Lavalle", "Alsina", "Corrientes", "Moreno", "Urquiza", "Independencia", "Italia"];
  const person = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;
  const phone = (i: number) => `11 ${4000 + ((i * 137) % 1000)}-${String(1000 + ((i * 7919) % 9000))}`;
  const emailOf = (name: string) => `${norm(name).split(" ").join(".")}@ejemplo.com`;

  const customers: Customer[] = [];
  // Compradores de Mercado Libre: la API solo da el usuario y la ciudad; algunos ya dejaron sus datos por mensaje.
  const ML_USERS = ["LUCIA_F88", "MARTINGO", "SOFI.RAMIREZ", "DIEGOH_22", "VALEDIAZ", "TOMI_ACOSTA", "CAMITORRES", "JULIRUIZ", "FLORSOSA", "NICOMEDINA", "AGUSROMERO", "FACU_ALVAREZ", "MICACASTRO", "MATIORTIZ", "ROMISILVA", "SEBAROJAS", "CAROMOLINA", "GONZASUAREZ", "PAUBENITEZ", "EZE.NUNEZ", "NATAFER", "RAMIGO", "BELU_DIAZ", "LEOHERRERA"];
  const mlBuyers = ML_USERS.map((user, i) => {
    const [city, prov] = PLACES[(i * 5 + 2) % PLACES.length];
    const complete = i >= 8; // los primeros todavía no dieron sus datos
    const real = person(i + 4);
    const c: Customer = {
      id: `mlb_${20000000 + i * 3571}`, name: complete ? real : user, company: "", phone: complete ? phone(i + 40) : "", email: complete ? emailOf(real) : "", city: `${city}, ${prov}`, origin: "Mercado Libre",
      createdAt: isoDaysAgo(110 - i * 4), nickname: complete ? user : undefined, address: complete ? `${pick(STREETS)} ${100 + Math.floor(rnd() * 3900)}` : "", full: complete,
    };
    customers.push(c);
    return c;
  });
  // Clientes de Tienda Nube: la tienda trae todos sus datos.
  const tnCustomers = Array.from({ length: 12 }, (_, i) => {
    const name = person(i + 11);
    const [city, prov] = PLACES[(i * 3 + 1) % PLACES.length];
    const c: Customer = {
      id: `tn${i + 1}`, name, company: "", phone: phone(i + 90), email: emailOf(name), city: `${city}, ${prov}`, origin: "Tienda Nube", createdAt: isoDaysAgo(95 - i * 6),
      address: `${pick(STREETS)} ${100 + Math.floor(rnd() * 3900)}`, doc: String(20000000 + i * 913211), full: true,
    };
    customers.push(c);
    return c;
  });
  const directos: Customer[] = [
    ["Gómez y Asoc.", "Martín Gómez", "Córdoba Capital, Córdoba", "Recomendación"], ["Herrera Regalos", "Diego Herrera", "Mendoza Capital, Mendoza", "Web"], ["Acosta Oficinas", "Tomás Acosta", "Palermo, CABA", "Venta directa"],
    ["", "Camila Torres", "San Miguel de Tucumán, Tucumán", "Instagram"], ["", "Julieta Pereyra", "Rosario, Santa Fe", "Instagram"], ["Estudio Lamas", "Andrea Lamas", "Caballito, CABA", "Recomendación"],
    ["", "Hernán Giménez", "La Plata, Buenos Aires", "Web"], ["", "Marina Quiroga", "Morón, Buenos Aires", "Instagram"],
  ].map(([company, name, city, origin], i) => {
    const c: Customer = { id: `c${i + 1}`, name, company, phone: phone(i + 150), email: emailOf(name), city, origin, createdAt: isoDaysAgo(120 - i * 9), address: `${pick(STREETS)} ${100 + Math.floor(rnd() * 3900)}`, full: true };
    customers.push(c);
    return c;
  });

  // ───────── Ventas (100 días) ─────────
  const channelMix: [string, number][] = [["Mercado Libre", 56], ["Tienda Nube", 22], ["Venta directa", 8], ["Instagram", 8], ["Web", 6]];
  const pickChannel = () => { let x = rnd() * 100; for (const [c, w] of channelMix) { x -= w; if (x <= 0) return c; } return "Mercado Libre"; };
  const sales: Sale[] = [];
  let num = 1000;
  let mlSeq = 2000014000000;
  for (let d = 100; d >= 0; d--) {
    const grow = 1 + (100 - d) / 120; // el negocio viene creciendo
    const count = rnd() < 0.18 ? 0 : Math.max(1, Math.round((1 + rnd() * 2.4) * grow * 1.6 * (d < 14 ? 1.25 : 1)));
    for (let k = 0; k < count; k++) {
      const channel = pickChannel();
      const pool = channel === "Mercado Libre" ? mlBuyers : channel === "Tienda Nube" ? tnCustomers : directos;
      const customer = pick(pool);
      const lines = channel === "Mercado Libre" || rnd() < 0.55 ? 1 : 2;
      const used = new Set<string>();
      const items = Array.from({ length: lines }, () => {
        let p = pickProduct();
        while (used.has(p.id)) p = pickProduct();
        used.add(p.id);
        return { productId: p.id, qty: rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * 3), unitPrice: p.price, discountPct: channel !== "Mercado Libre" && rnd() < 0.12 ? 10 : 0 };
      });
      const gross = items.reduce((s, i) => s + i.qty * i.unitPrice * (1 - i.discountPct / 100), 0);
      const cancelled = d >= 1 && rnd() < 0.035;
      const status: Sale["status"] = cancelled ? "cancelada" : d <= 1 ? pick(["pendiente", "preparando", "preparando"] as const) : d <= 3 ? pick(["preparando", "enviado"] as const) : d <= 5 ? pick(["enviado", "entregado", "entregado"] as const) : "entregado";
      const feePct = channel === "Mercado Libre" ? 0.175 : channel === "Tienda Nube" ? 0.056 : 0;
      const sale: Sale = {
        id: `v${++num}`, number: num, customerId: customer.id, date: isoDaysAgo(d), channel, status,
        payMethod: channel === "Mercado Libre" ? "Mercado Pago" : channel === "Tienda Nube" ? pick(["Tarjeta", "Mercado Pago", "Transferencia"]) : pick(["Efectivo", "Transferencia", "Mercado Pago"]),
        extraCosts: channel === "Venta directa" ? 0 : Math.round((1200 + rnd() * 2800) / 100) * 100, items,
        netAmount: cancelled ? 0 : Math.round(gross * (1 - feePct)), payStatus: cancelled ? "reembolsada" : "cobrada",
      };
      if (channel === "Mercado Libre") sale.mlOrderId = String((mlSeq += 1 + Math.floor(rnd() * 90000)));
      if (cancelled) { sale.refundedAt = isoDaysAgo(d); if (d > 3) sale.refundDoneAt = isoDaysAgo(d - 1); }
      // Bienvenida de Mercado Libre: las compras de los últimos días, algunas todavía sin contactar y otras esperando los datos.
      if (channel === "Mercado Libre" && !cancelled) {
        if (rnd() < 0.35 && d <= 4) { /* sin contactar: queda en "Nuevos compradores" */ } else {
          sale.welcomed = true; sale.welcomedAt = isoDaysAgo(d); sale.welcomeSentAt = isoDaysAgo(d); sale.welcomeBy = rnd() < 0.5 ? "auto" : "manual";
          if (d > 9) sale.waitingHidden = true; // las compras viejas ya no figuran como "esperando datos"
        }
      }
      if (channel !== "Mercado Libre" && !cancelled && d > 3) { sale.welcomed = true; sale.welcomedAt = isoDaysAgo(d); sale.waitingHidden = true; }
      sales.push(sale);
    }
  }
  // Un reclamo abierto para mostrar el aviso de "reclamo" en Ventas.
  const claimable = sales.filter((s) => s.channel === "Mercado Libre" && s.status === "entregado" && s.date >= isoDaysAgo(20)).at(0);
  if (claimable) claimable.payStatus = "reclamo";

  // ───────── Stock ─────────
  const movements: StockMovement[] = [];
  const mv = (productId: string, type: StockMovement["type"], qty: number, date: string, reason: string, ref?: string, unitCost?: number) =>
    movements.push({ id: id("m"), productId, type, qty, date, reason, ref, unitCost });
  const sold = new Map<string, number>();
  for (const s of sales) if (s.status === "enviado" || s.status === "entregado") for (const it of s.items) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.qty);
  // Compras ya recibidas: dejan el stock actual en distintos niveles (algunos productos quedan bajos para las alertas).
  const targetLeft: Record<number, number> = { 2: 3, 4: 2, 6: 4, 8: 5, 12: 6 };
  const purchases: Db["purchases"] = [];
  products.forEach((p, i) => {
    const left = targetLeft[i] ?? Math.round(p.minStock * (1.2 + rnd() * 2.4));
    const total = (sold.get(p.id) ?? 0) + left;
    const first = Math.ceil(total * 0.65), second = total - first;
    const date1 = isoDaysAgo(101), date2 = isoDaysAgo(34 + Math.floor(rnd() * 8));
    mv(p.id, "ingreso", first, date1, "Compra recibida", `b${i * 2 + 1}`, p.cost);
    if (second > 0) mv(p.id, "ingreso", second, date2, "Compra recibida", `b${i * 2 + 2}`, p.cost);
  });
  for (const s of sales) if (s.status === "enviado" || s.status === "entregado") for (const it of s.items) mv(it.productId, "egreso", -it.qty, s.date, "Venta", `V-${s.number}`);
  mv(products[8].id, "merma", -3, isoDaysAgo(9), "Mercadería dañada");
  mv(products[5].id, "rotura", -2, isoDaysAgo(14), "Rotura en depósito");
  mv(products[0].id, "devolucion", 1, isoDaysAgo(6), "Devolución de un cliente");

  const bySupplier = new Map<string, Product[]>();
  for (const p of products) bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p]);
  let bn = 1;
  for (const [sid, list] of bySupplier) {
    purchases.push({ id: `b${bn++}`, supplierId: sid, date: isoDaysAgo(101), status: "recibida", payMethod: "Transferencia", shipping: 12000, items: list.map((p) => ({ productId: p.id, qty: Math.ceil((sold.get(p.id) ?? 20) * 0.65) + 5, unitCost: p.cost })) });
    purchases.push({ id: `b${bn++}`, supplierId: sid, date: isoDaysAgo(36), status: "recibida", payMethod: sid === "s2" ? "Contado" : "Transferencia", shipping: 9000, items: list.slice(0, 3).map((p) => ({ productId: p.id, qty: 25, unitCost: p.cost })) });
  }
  purchases.push({ id: `b${bn++}`, supplierId: "s2", date: isoDaysAgo(3), status: "pendiente", payMethod: "Contado", shipping: 9000, items: [{ productId: products[2].id, qty: 25, unitCost: 14000 }, { productId: products[4].id, qty: 60, unitCost: 1800 }] });
  purchases.push({ id: `b${bn++}`, supplierId: "s1", date: isoDaysAgo(1), status: "borrador", payMethod: "Transferencia", shipping: 0, items: [{ productId: products[0].id, qty: 40, unitCost: 9200 }] });

  // ───────── Envíos ─────────
  const stageOf = (s: Sale, age: number): string =>
    s.status === "pendiente" ? "compra" : s.status === "preparando" ? (age === 0 ? "preparado" : pick(["preparado", "empaquetado"])) : s.status === "enviado" ? "en_viaje" : "entregado";
  const shipments: Shipment[] = [];
  const nameOfProduct = (pid: string) => products.find((p) => p.id === pid)?.name ?? "Producto";
  const interior = (city: string) => !/(CABA|Buenos Aires)/.test(city);
  let hn = 1;
  const recent = sales.filter((s) => s.status !== "cancelada" && s.date >= isoDaysAgo(12) && s.channel !== "Venta directa");
  recent.forEach((s, idx) => {
    const c = customers.find((x) => x.id === s.customerId)!;
    const age = Math.round((Date.now() - new Date(`${s.date}T12:00:00`).getTime()) / 86400000);
    let stage = stageOf(s, age);
    if (idx === 60) stage = "no_entregado";
    if (idx === 75) stage = "volvio";
    const delivered = stage === "entregado" || stage === "no_entregado" || stage === "volvio";
    const external = interior(c.city);
    const sh: Shipment = {
      id: `h${hn++}`, saleId: s.id, orderRef: s.mlOrderId ?? `TN-${s.number}`, channel: s.channel, customer: c.name, phone: c.phone, address: c.address ?? "", city: c.city,
      zip: String(1000 + Math.floor(rnd() * 8000)), items: s.items.map((i) => `${i.qty} × ${nameOfProduct(i.productId)}`).join(" · "), notes: "", tracking: external && stage !== "compra" ? `VC-${100000 + Math.floor(rnd() * 899999)}` : "",
      stage, createdAt: s.date, carrier: external ? "viacargo" : "", mlShipmentId: s.mlOrderId ? `4${String(s.mlOrderId).slice(-9)}` : undefined,
      mlStatus: s.mlOrderId ? (stage === "compra" ? "pending" : stage === "preparado" || stage === "empaquetado" ? "ready_to_ship" : stage === "en_viaje" ? "shipped" : stage === "entregado" ? "delivered" : "not_delivered") : undefined,
    };
    if (!external && (stage === "en_viaje" || delivered)) { sh.courier = "Carlos Medina"; sh.courierPhone = "11 5555-0199"; sh.vehicle = "Furgoneta blanca"; sh.plate = "AB123CD"; }
    if (["en_viaje", "entregado"].includes(stage) || delivered) sh.dispatchedAt = isoDaysAgo(Math.max(age - 1, 0));
    if (stage === "entregado") sh.deliveredAt = isoDaysAgo(Math.max(age - 2, 0));
    shipments.push(sh);
  });

  // ───────── Presupuestos, gastos, caja, oportunidades ─────────
  const quotes = [
    { id: "q1", number: 1, customerId: "c1", date: isoDaysAgo(6), validUntil: isoDaysAgo(-9), status: "enviado" as const, discountPct: 5, taxPct: 21, customerName: "Gómez y Asoc.", items: [{ productId: products[2].id, qty: 10, unitPrice: 29900 }, { productId: products[3].id, qty: 10, unitPrice: 11900 }] },
    { id: "q2", number: 2, customerId: "c3", date: isoDaysAgo(20), validUntil: isoDaysAgo(5), status: "enviado" as const, discountPct: 0, taxPct: 21, customerName: "Acosta Oficinas", items: [{ productId: products[8].id, qty: 50, unitPrice: 3900 }] },
    { id: "q3", number: 3, customerId: "c2", date: isoDaysAgo(12), validUntil: isoDaysAgo(-2), status: "aceptado" as const, discountPct: 8, taxPct: 21, customerName: "Herrera Regalos", items: [{ productId: products[0].id, qty: 20, unitPrice: 18500 }] },
    { id: "q4", number: 4, customerId: "c6", date: isoDaysAgo(1), validUntil: isoDaysAgo(-14), status: "borrador" as const, discountPct: 0, taxPct: 21, customerName: "Estudio Lamas", items: [{ productId: products[13].id, qty: 12, unitPrice: 8900 }] },
    { id: "q5", number: 5, customerId: "c5", date: isoDaysAgo(30), validUntil: isoDaysAgo(15), status: "rechazado" as const, discountPct: 0, taxPct: 21, customerName: "Julieta Pereyra", items: [{ productId: products[10].id, qty: 2, unitPrice: 45900 }] },
  ];

  const expenses: Expense[] = [];
  const recurring: [string, string, number][] = [
    ["Publicidad", "Campaña en Mercado Libre (Product Ads)", 85000], ["Publicidad", "Campaña en redes sociales", 52000], ["Logística", "Envíos del mes", 62000], ["Servicios", "Internet y telefonía", 21000],
    ["Packaging", "Cajas y cintas", 27500], ["Combustible", "Reparto local", 18000], ["Alquiler", "Depósito", 120000], ["Impuestos", "Monotributo", 34000], ["Administración", "Contador", 45000],
  ];
  for (let m = 0; m < 4; m++) recurring.forEach(([category, description, amount], i) => {
    const day = m * 30 + 3 + i * 2;
    expenses.push({ id: `e${expenses.length + 1}`, date: isoDaysAgo(day), category, description, amount: Math.round(amount * (0.9 + rnd() * 0.25) / 100) * 100, payMethod: i % 2 ? "Transferencia" : "Efectivo" });
  });
  const cash = [
    { id: "k1", date: isoDaysAgo(95), type: "ingreso" as const, account: "Banco", concept: "Capital inicial", amount: 1500000 },
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
    ["Kits de oficina para estudio", "Estudio Lamas", "Recomendación", 210000, "Presupuesto", 55, 6, "Seguimiento del presupuesto"],
    ["Venta cerrada set deportivo", "Julián Ruiz", "Mercado Libre", 150000, "Ganado", 100, -3, "Coordinar entrega"],
    ["Cotización sin respuesta", "Valentina Díaz", "Mercado Libre", 70000, "Perdido", 0, -10, "—"],
  ].map((o, i) => ({
    id: `o${i + 1}`, name: String(o[0]), customerName: String(o[1]), origin: String(o[2]), value: Number(o[3]), stage: o[4] as Db["opportunities"][number]["stage"],
    probability: Number(o[5]), dueDate: isoDaysAgo(-Number(o[6])), nextAction: String(o[7]),
  }));

  const channels = channelMix.map(([c]) => c);
  return {
    settings: {
      name: "Mi negocio (DEMO)", currency: "ARS", country: "Argentina", mlSite: "MLA", taxPct: 21,
      channels, categories: ["Hogar", "Tecnología", "Deportes", "Oficina"], units: ["unidad", "caja", "kg", "litro"], payMethods: ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta"],
      expenseCategories: ["Logística", "Combustible", "Publicidad", "Comisiones", "Servicios", "Alquiler", "Packaging", "Herramientas", "Impuestos", "Administración", "Otros"],
      cogsCategories: [], costs: { logisticsPerShipment: 0, boxPerPack: 0, gncPct: 0 },
      company: {
        legalName: "Mi negocio S.R.L.", cuit: "30-00000000-0", taxCondition: "Responsable inscripto", address: "Av. Ejemplo 1234", city: "Ciudad Autónoma de Buenos Aires", province: "CABA", zip: "C1000",
        phone: "11 5555-0000", whatsapp: "11 5555-0000", email: "hola@minegocio.example", website: "https://tu-tienda.com", instagram: "@minegocio",
        accountantName: "Estudio Contable Demo", accountantEmail: "contador@ejemplo.com", mlFollowers: 1840, mlFollowersAt: isoDaysAgo(2),
        driverName: "Carlos Medina", driverPhone: "11 5555-0199", driverVehicle: "Furgoneta blanca", driverPlate: "AB123CD", driverActive: true, orderSupplierId: "s1",
      },
    },
    products, movements, suppliers, purchases, customers, sales, quotes, expenses, cash, opportunities, shipments, nextId: 10000, isDemo: true,
  };
}
