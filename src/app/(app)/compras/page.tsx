import { redirect } from "next/navigation";

// Compras ahora es una solapa de Gastos.
export default function ComprasRedirect() {
  redirect("/gastos?tab=compras");
}
