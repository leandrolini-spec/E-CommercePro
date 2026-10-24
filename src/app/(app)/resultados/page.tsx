import { redirect } from "next/navigation";
import { param, type SearchParams } from "@/components/shared/list";

/** Resultados ahora es una pestaña de Reportes: el enlace viejo sigue funcionando. */
export default async function ResultadosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const m = param(await searchParams, "m");
  redirect(`/reportes?tab=resultados${m ? `&m=${m}` : ""}`);
}
