import { service } from "@/core/db-client";
import { getDb, getDbForProject } from "@/modules/data";
import { isSupabase } from "@/modules/repo/supabase";
import type { Db } from "@/modules/types";

// Los enlaces públicos (presupuesto, seguimiento de un pedido) se abren sin sesión: la empresa se descubre por el propio enlace.
// Cada código identifica un solo registro, así que el enlace nunca muestra datos de otra empresa.

/** Datos de la empresa dueña del presupuesto con ese código, o null si no existe. */
export async function dbForQuoteToken(token: string): Promise<Db | null> {
  if (!isSupabase()) return getDb();
  const { data, error } = await service().from("quotes").select("project_id").eq("share_token", token).limit(1);
  if (error) throw new Error(`No se pudo leer el presupuesto: ${error.message}`);
  return data?.length ? getDbForProject(data[0].project_id as string) : null;
}

/** Datos de la empresa dueña de ese envío, o null si no existe. */
export async function dbForShipment(shipmentId: string): Promise<Db | null> {
  if (!isSupabase()) return getDb();
  const { data, error } = await service().from("shipments").select("project_id").eq("id", shipmentId).limit(1);
  if (error) throw new Error(`No se pudo leer el envío: ${error.message}`);
  return data?.length ? getDbForProject(data[0].project_id as string) : null;
}
