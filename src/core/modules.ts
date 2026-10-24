// Módulos del menú lateral (brief, sección 6). Más adelante `enabled` sale de
// project_settings para poder activar/desactivar módulos por proyecto.
export type ModuleDef = { slug: string; label: string; enabled: boolean; /** Logo que reemplaza al texto en el menú (archivo de public/). */ logo?: string; /** Alto del logo en píxeles. */ logoHeight?: number };

export const MODULES: ModuleDef[] = [
  { slug: "mercadolibre", label: "Mercado Libre", enabled: true, logo: "/brand/mercadolibre.png", logoHeight: 22 },
  { slug: "tiendanube", label: "Tienda Nube", enabled: true, logo: "/brand/tiendanube.png", logoHeight: 15 },
  { slug: "", label: "Dashboard", enabled: true },
  { slug: "mensajes", label: "Mensajes", enabled: true },
  { slug: "clientes", label: "Clientes", enabled: true },
  { slug: "recontacto", label: "Recontacto", enabled: true },
  { slug: "ventas", label: "Ventas", enabled: true },
  { slug: "envios", label: "Envíos", enabled: true },
  { slug: "etiquetas", label: "Etiquetas", enabled: true },
  { slug: "productos", label: "Productos", enabled: true },
  { slug: "stock", label: "Stock", enabled: true },
  { slug: "proveedores", label: "Proveedores", enabled: true },
  { slug: "presupuestos", label: "Presupuestos", enabled: true },
  { slug: "gastos", label: "Gastos", enabled: true },
  { slug: "socios", label: "Socios", enabled: true },
  { slug: "reportes", label: "Reportes", enabled: true },
  { slug: "configuracion", label: "Configuración", enabled: true },
  // Ocultos (sus funciones viven en otras secciones): Compras está dentro de Gastos; Pedidos y Caja no se usan.
  { slug: "compras", label: "Compras", enabled: false },
  { slug: "pedidos", label: "Pedidos", enabled: false },
  { slug: "caja", label: "Caja", enabled: false },
  // Abastecimiento: el pedido semanal sugerido al productor. Oculto del menú (la pantalla sigue en /abastecimiento por si se vuelve a usar).
  { slug: "abastecimiento", label: "Abastecimiento", enabled: false },
];

export function enabledModules(): ModuleDef[] {
  return MODULES.filter((m) => m.enabled);
}
