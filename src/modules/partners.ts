/** Quiénes pueden pagar un gasto. "Negocio" es la plata del negocio: no cuenta como inversión de un socio. */
export const PAYERS = ["Socio 1", "Socio 2", "Socio 3", "Negocio"];
/** Socios con cuenta propia en la sección Socios (otros aparecen solo si tienen movimientos). */
export const SOCIOS = ["Socio 1", "Socio 2"];
/** Gasto que se creó junto con una compra (las cargadas desde Gastos tienen el mismo número sin el prefijo "b_"). */
export const expenseIdOf = (purchaseId: string) => (purchaseId.startsWith("b_e") ? purchaseId.slice(2) : `e_${purchaseId}`);
export const NEGOCIO = "Negocio";
