export type ID = string;

export type Product = {
  id: ID; sku: string; name: string; category: string; brand: string; unit: string;
  cost: number; price: number; minStock: number; maxStock: number; supplierId: ID; active: boolean;
  /** Unidades por pack (p. ej. 200 productos). Habilita el análisis "por unidad". */
  packSize?: number;
  /** false = no se lleva control de stock (no genera alertas de stock). Por defecto true. */
  trackStock?: boolean;
  /** Descripción (en un kit se arma sola con lo que lleva). */
  description?: string;
  /** Stock infinito: siempre hay (no se cuenta ni se descuenta; figura como ∞). */
  unlimited?: boolean;
  /** venta = se vende; componente = pieza para armar kits (lleva stock); consumible = uso interno (embalaje, librería…), sin stock. */
  kind?: "venta" | "componente" | "consumible";
  /** Producto compuesto (kit): qué lleva y cuántas unidades de cada componente. El costo y el stock salen de ahí. */
  components?: { productId: ID; qty: number }[];
  /** Publicaciones en canales sin conexión automática (p. ej. Tienda Nube). Mercado Libre se lee solo. */
  listings?: Listing[];
};

export type Listing = { channel: string; status: "active" | "out_of_stock" | "paused"; price: number; url: string };

export type MovementType = "ingreso" | "egreso" | "ajuste" | "devolucion" | "perdida" | "rotura" | "merma";
/** `qty` con signo: positivo suma stock, negativo resta. */
export type StockMovement = {
  id: ID; productId: ID; type: MovementType; qty: number; date: string; reason: string; ref?: string; unitCost?: number;
};

export type Supplier = {
  id: ID; name: string; company: string; phone: string; email: string; cuit: string; leadDays: number; payTerms: string;
  /** Agenda de proveedores: persona de contacto, rubro, ubicación, sitio y observaciones. */
  contactName?: string; category?: string; address?: string; city?: string; website?: string; notes?: string;
};

export type PurchaseStatus = "borrador" | "pendiente" | "recibida" | "parcial" | "cancelada";
export type Purchase = {
  id: ID; supplierId: ID; date: string; status: PurchaseStatus; payMethod: string; shipping: number;
  items: { productId: ID; qty: number; unitCost: number }[];
};

export type Customer = {
  id: ID; name: string; company: string; phone: string; email: string; city: string; origin: string; createdAt: string;
  /** Cliente con datos completos: apodo de Mercado Libre (si venía de ahí), dirección, documento y notas. */
  nickname?: string; address?: string; doc?: string; notes?: string;
  /** En la Agenda: se calcula solo (nombre + dirección + teléfono). */
  full?: boolean;
  /** Sacado de la Agenda a mano (aunque tenga los datos). */
  agendaOff?: boolean;
};

export type SaleStatus = "pendiente" | "preparando" | "enviado" | "entregado" | "cancelada";
export type Sale = {
  id: ID; number: number; customerId: ID; date: string; channel: string; status: SaleStatus; payMethod: string;
  extraCosts: number; items: { productId: ID; qty: number; unitPrice: number; discountPct: number }[];
  /** Lo que realmente se cobró, después de cargos e impuestos del canal. Si falta, se asume igual al bruto. */
  netAmount?: number;
  /** Estado del cobro. "reembolsada" no suma; "reclamo" suma pero se advierte. */
  payStatus?: "cobrada" | "reclamo" | "reembolsada";
  /** ID de la orden en Mercado Libre. */
  mlOrderId?: string;
  /** Ya se le mandó el primer mensaje de bienvenida al comprador (sale de "Nuevos compradores"). */
  welcomed?: boolean;
  /** Día en que se le dio la bienvenida (o se sacó de la lista de nuevos compradores). */
  welcomedAt?: string;
  /** Día en que se le mandó el mensaje de bienvenida (a mano o automático). La tarjeta sigue en Nuevos compradores hasta que se la saque a mano. */
  welcomeSentAt?: string;
  /** Cómo se mandó la bienvenida: sola (automática) o a mano. */
  welcomeBy?: "auto" | "manual";
  /** Día en que la venta se cayó y hubo que devolver la plata (para el aviso de reembolso). */
  refundedAt?: string;
  /** Día en que se devolvió la plata al comprador (sale de la lista "Reembolsar"). */
  refundDoneAt?: string;
  /** Sacada a mano de la lista "Esperando datos". */
  waitingHidden?: boolean;
};

export type QuoteStatus = "borrador" | "enviado" | "aceptado" | "rechazado" | "vencido";
export type Quote = {
  id: ID; number: number; customerId: ID; date: string; validUntil: string; status: QuoteStatus;
  discountPct: number; taxPct: number; items: { productId: ID; qty: number; unitPrice: number; description?: string }[];
  /** Logística (envío) que se suma al presupuesto; 0 si no hace falta. */
  shipping?: number;
  /** Nombre del cliente tal como se imprime en el presupuesto. */
  customerName?: string;
  /** Notas o condiciones que se imprimen al pie. */
  notes?: string;
  /** Contacto del cliente para enviarle el presupuesto. */
  customerPhone?: string; customerEmail?: string;
  /** Clave del link público para compartirlo (no se puede adivinar). */
  shareToken?: string;
};

export type Expense = {
  id: ID; date: string; category: string; description: string; amount: number; payMethod: string;
  quantity?: number;
  /** Para vender (mercadería), insumo de la empresa o inversión. Un insumo aparece solo en Productos → Insumos de la empresa. */
  kind?: "venta" | "insumo" | "inversion";
  /** Quién puso la plata (socio). */
  paidBy?: string;
  /** Compra de stock para kits todavía sin vender: no es gasto operativo. */
  kitStock?: boolean;
};

/** Movimiento de un socio: retiro (adelanto que saca, no es gasto) o inversión (plata que pone). */
export type Advance = { id: ID; date: string; partner: string; amount: number; note: string; kind?: "retiro" | "inversion" };

export type CashMovement = {
  id: ID; date: string; type: "ingreso" | "egreso"; account: string; concept: string; amount: number;
};

export const STAGES = ["Nuevo", "Contactado", "Interesado", "Presupuesto", "Negociación", "Ganado", "Perdido"] as const;
export type Stage = (typeof STAGES)[number];
export type Opportunity = {
  id: ID; name: string; customerName: string; origin: string; value: number; stage: Stage;
  probability: number; dueDate: string; nextAction: string;
};

/** Datos de la empresa: aparecen en presupuestos y documentos. */
export type CompanyInfo = {
  legalName?: string; cuit?: string; taxCondition?: string; address?: string; city?: string; province?: string; zip?: string;
  phone?: string; whatsapp?: string; email?: string; website?: string; instagram?: string;
  /** Contador/a de la empresa: a quién se le manda el informe mensual. */
  accountantName?: string; accountantPhone?: string; accountantEmail?: string;
  /** Titular del CUIT (la persona a cuyo nombre está). */
  holderName?: string; holderDoc?: string; holderAddress?: string; holderPhone?: string; holderEmail?: string;
  /** Seguidores de la cuenta de Mercado Libre: la API no los informa, se cargan a mano. */
  mlFollowers?: number; mlFollowersAt?: string;
  /** Entregas: días de reparto (0 = domingo … 6 = sábado), horario, retiro de la logística y días sin reparto (AAAA-MM-DD). */
  deliveryDays?: number[]; deliveryFrom?: string; pickupFrom?: string; pickupTo?: string; deliveryOff?: string[];
  /** Avisos al celular del negocio (notificación por ntfy.sh): cuando entra una pregunta o un mensaje de un comprador y cuando pasa una hora sin responder. */
  alerts?: { enabled: boolean; ntfyTopic: string };
  /** Abastecimiento de bandejas: capacidad semanal del productor, margen de seguridad (%) y el último conteo de bandejas en mano. */
  trayPlan?: { capacity: number; buffer: number; stock?: { date: string; counts: Record<string, number> } };
  /** Chofer de reparto: sus datos se anotan en cada envío que sale "En viaje". */
  driverName?: string; driverPhone?: string; driverVehicle?: string; driverPlate?: string;
  /** El chofer solo se anota en los envíos y los mensajes si esto está activado (si la logística no dice quién entrega, queda apagado). */
  driverActive?: boolean;
  /** Mercado Libre: manda solo la bienvenida a las compras de productos apenas entran (apagado por defecto). */
  welcomeAuto?: boolean;
  /** Integraciones que este negocio no usa (se ocultan del menú y figuran como desactivadas). Ej: "mercadolibre", "tiendanube". */
  integrationsOff?: string[];
  /** Respuestas rápidas para las mensajerías (si está vacío se usan las que vienen armadas). */
  quickReplies?: { title: string; text: string }[];
};
/** Marca: logo y estilo que se ven en el menú y en los presupuestos. */
export type BrandInfo = { logoUrl?: string; tagline?: string; color?: string; color2?: string; quoteFooter?: string; fontTitle?: string; fontSubtitle?: string; fontText?: string };

export type ProjectSettings = {
  company?: CompanyInfo; brand?: BrandInfo;
  name: string; currency: string; country: string; mlSite: string; taxPct: number;
  channels: string[]; categories: string[]; units: string[]; payMethods: string[];
  expenseCategories: string[];
  /** Categorías de gasto que ya están en el costo de lo vendido (no se cuentan dos veces en el resultado). */
  cogsCategories: string[];
  /** Costos estimados para el análisis por unidad vendida (0 = automático desde los gastos). */
  costs: { logisticsPerShipment: number; boxPerPack: number; gncPct: number };
  /** Etapas del seguimiento de envíos, en orden (se pueden personalizar). */
  shipmentStages?: ShipStage[];
};

export type ShipStage = { id: string; name: string; color: string; /** Mensaje de WhatsApp para avisarle al cliente cuando el envío está en esta etapa. */ message?: string };

/** Un envío: a quién, adónde, qué día salió y en qué etapa está. */
export type Shipment = {
  id: ID; saleId?: string; orderRef: string; channel: string; customer: string; phone: string; address: string; city: string; zip: string;
  items: string; notes: string; tracking: string;
  /** Quién entrega y en qué vehículo. */
  courier?: string; courierPhone?: string; vehicle?: string; plate?: string;
  stage: string; dispatchedAt?: string; deliveredAt?: string; createdAt: string; mlStatus?: string; mlShipmentId?: string;
  /** Entrega estimada fijada a mano (si falta, se calcula con las reglas de entrega). */
  eta?: string;
  /** "viacargo" = va por Vía Cargo al interior; vacío = reparto propio. */
  carrier?: string; // "" o "propio" = reparto propio (con chofer); "logistica" = la logística entrega; "viacargo" = Vía Cargo
};

export type Db = {
  settings: ProjectSettings;
  products: Product[]; movements: StockMovement[]; suppliers: Supplier[]; purchases: Purchase[];
  customers: Customer[]; sales: Sale[]; quotes: Quote[]; expenses: Expense[]; cash: CashMovement[];
  opportunities: Opportunity[]; nextId: number;
  advances?: Advance[];
  shipments?: Shipment[];
  /** true cuando son datos de demostración. */
  isDemo?: boolean;
};
