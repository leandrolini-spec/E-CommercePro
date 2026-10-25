import { service } from "./db-client";
import { ACCESS_COOKIE, REFRESH_COOKIE, verifySession } from "./session";

export type Role = "owner" | "member";

/** Resultado de buscar la empresa de quien hace el pedido. */
export type Company =
  | { status: "ok"; userId: string; projectId: string; role: Role }
  | { status: "no-company"; userId: string }
  | { status: "no-session" };

/** Lo mínimo del cliente de base que usa este archivo (permite probarlo sin un Supabase real). */
export type MembersDb = { from(table: "project_members"): { select(cols: string): { eq(col: string, value: string): { maybeSingle(): PromiseLike<{ data: { project_id: string; role: string } | null; error: { message: string } | null }> } } } };

// La empresa de un usuario casi nunca cambia: se recuerda un minuto por usuario (la clave es el usuario, nunca algo global).
// Solo se recuerdan los que tienen empresa: a quien recién se dio de alta no se le debe seguir diciendo "sin empresa".
const TTL = 60_000;
const cached = new Map<string, { at: number; projectId: string; role: Role }>();

/** Empresa a la que pertenece el usuario, o null si no tiene ninguna asignada. */
export async function membershipOf(userId: string, db: MembersDb = service() as unknown as MembersDb): Promise<{ projectId: string; role: Role } | null> {
  const hit = cached.get(userId);
  if (hit && Date.now() - hit.at < TTL) return { projectId: hit.projectId, role: hit.role };
  const { data, error } = await db.from("project_members").select("project_id,role").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la empresa del usuario: ${error.message}`);
  if (!data) return null;
  const role: Role = data.role === "owner" ? "owner" : "member";
  cached.set(userId, { at: Date.now(), projectId: data.project_id, role });
  if (cached.size > 500) for (const [k, v] of cached) if (Date.now() - v.at > TTL) cached.delete(k);
  return { projectId: data.project_id, role };
}

/** Olvida lo recordado de un usuario (para cuando se le cambia la empresa). */
export const forgetMembership = (userId: string) => void cached.delete(userId);

/** Empresa de la persona logueada, leyendo las cookies del pedido. Solo en pedidos con sesión (pantallas, acciones, rutas). */
export async function currentCompany(): Promise<Company> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const s = await verifySession(store.get(ACCESS_COOKIE)?.value, store.get(REFRESH_COOKIE)?.value);
  if (!s.ok || !s.userId) return { status: "no-session" };
  const m = await membershipOf(s.userId);
  return m ? { status: "ok", userId: s.userId, ...m } : { status: "no-company", userId: s.userId };
}
