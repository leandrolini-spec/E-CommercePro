import { service } from "@/core/db-client";

export type Channel = "whatsapp" | "instagram";

/** Lo mínimo del cliente de base que usa este archivo (permite probarlo sin un Supabase real). */
export type LookupDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): { in(col: string, values: string[]): { limit(n: number): PromiseLike<{ data: { project_id: string }[] | null; error: { message: string } | null }> } };
      limit(n: number): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * Empresa única de la base, o null si hay varias (o ninguna).
 * En un despliegue por cliente hay una sola empresa: sirve para procesos sin sesión (webhooks, diagnóstico) sin configurar nada más.
 */
export async function onlyProjectId(db: LookupDb = service() as unknown as LookupDb): Promise<string | null> {
  const { data, error } = await db.from("projects").select("id").limit(2);
  if (error) throw new Error(`No se pudo leer projects: ${error.message}`);
  return data?.length === 1 ? data[0].id : null;
}

/**
 * Empresa dueña de una cuenta de WhatsApp o Instagram (por el id que informa Meta en el aviso).
 * 1) La cuenta está registrada en channel_accounts → esa empresa.
 * 2) No está registrada y hay una sola empresa en la base → esa (despliegue por cliente).
 * 3) Si no, null: el aviso no se puede asignar y no debe guardarse en ninguna empresa.
 */
export async function projectForChannel(channel: Channel, externalIds: string[], db: LookupDb = service() as unknown as LookupDb): Promise<string | null> {
  const ids = [...new Set(externalIds.map((i) => i.trim()).filter(Boolean))];
  if (ids.length) {
    const { data, error } = await db.from("channel_accounts").select("project_id").eq("channel", channel).in("external_id", ids).limit(1);
    if (error) throw new Error(`No se pudo leer channel_accounts: ${error.message}`);
    if (data?.length) return data[0].project_id;
  }
  return onlyProjectId(db);
}
