import type { Expense } from "./types";

export type ExpenseKind = NonNullable<Expense["kind"]>;

export const EXPENSE_KINDS: { value: ExpenseKind; label: string; short: string; color: string }[] = [
  { value: "venta", label: "Para vender (mercadería)", short: "Para vender", color: "#16a34a" },
  { value: "insumo", label: "Insumo de la empresa", short: "Insumo de la empresa", color: "#f59e0b" },
  { value: "inversion", label: "Inversión (servicios, equipos…)", short: "Inversión", color: "#7c3aed" },
];

/** Tipo que se propone según la categoría del gasto (se puede cambiar a mano). */
export function defaultExpenseKind(category: string): ExpenseKind | "" {
  const c = category.toLowerCase();
  if (["productos", "stock para kits"].includes(c)) return "venta";
  if (["packaging", "combustible", "librería", "libreria", "logística", "logistica"].includes(c)) return "insumo";
  if (["servicios", "publicidad", "impuestos", "comisiones"].includes(c)) return "inversion";
  return "";
}

/** Un gasto cargado como insumo genera/actualiza una compra con id derivado: el id inverso al de expenseIdOf. */
export const purchaseIdOf = (expenseId: string) => (expenseId.startsWith("e_b") ? expenseId.slice(2) : `b_${expenseId}`);

/** Categorías de mercadería: se cargan en Compras, no en Gastos. */
export const MERCH_CATEGORIES = ["Productos", "Stock para kits"];
/** Tipos de gasto de la empresa (lo que se carga en Gastos). */
export const COMPANY_KINDS = EXPENSE_KINDS.filter((k) => k.value !== "venta");
/** Un gasto es de la empresa si no es mercadería para vender. */
export const isCompanyExpense = (e: Pick<Expense, "kind" | "category">) => (e.kind ?? defaultExpenseKind(e.category)) !== "venta";
