// Módulos del menú lateral (brief, sección 6). Más adelante `enabled` sale de
// project_settings para poder activar/desactivar módulos por proyecto.
export type ModuleDef = { slug: string; label: string; enabled: boolean; /** Logo que reemplaza al texto en el menú (archivo de public/). */ logo?: string; /** Alto del logo en píxeles. */ logoHeight?: number; /** Grupo del menú: los módulos con el mismo grupo van seguidos bajo un título que se abre y se cierra. */ group?: string };

export const MODULES: ModuleDef[] = [
  { slug: "mercadolibre", label: "Mercado Libre", enabled: true, logo: "/brand/mercadolibre.png", logoHeight: 22 },
  { slug: "tiendanube", label: "Tienda Nube", enabled: true, logo: "/brand/tiendanube.png", logoHeight: 15 },
  { slug: "", label: "Resumen", enabled: true, group: "Dashboard" },
  { slug: "reportes", label: "Reportes", enabled: true, group: "Dashboard" },
  { slug: "mensajes", label: "Mensajes", enabled: true, group: "Comunicación" },
  { slug: "clientes", label: "Clientes", enabled: true, group: "Clientes" },
  { slug: "recontacto", label: "Recontacto", enabled: true, group: "Clientes" },
  { slug: "ventas", label: "Ventas", enabled: true, group: "Operación" },
  { slug: "envios", label: "Envíos", enabled: true, group: "Operación" },
  { slug: "etiquetas", label: "Etiquetas", enabled: true, group: "Operación" },
  { slug: "productos", label: "Productos", enabled: true, group: "Productos" },
  { slug: "stock", label: "Stock", enabled: true, group: "Productos" },
  { slug: "proveedores", label: "Proveedores", enabled: true, group: "Productos" },
  { slug: "presupuestos", label: "Presupuestos", enabled: true, group: "Finanzas" },
  { slug: "gastos", label: "Gastos", enabled: true, group: "Finanzas" },
  { slug: "socios", label: "Socios", enabled: false, group: "Finanzas" },
  { slug: "whatsapp", label: "WhatsApp", enabled: true, group: "Canales" },
  { slug: "anuncios", label: "Anuncios", enabled: true, group: "Canales" },
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
