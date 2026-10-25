import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente de servicio de Supabase. Solo para el servidor: salta el RLS, así que toda consulta debe filtrar por project_id. */
export function service(): SupabaseClient {
  if (client) return client;
  // trim: al pegar valores en el panel del servidor es común que se cuelen espacios o saltos de línea.
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  return (client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
