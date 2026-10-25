// Alta de una empresa y de su usuario (lo ejecutás vos al instalar un cliente nuevo).
//
//   npm run empresa:alta -- --nombre "Mi Empresa" --email dueno@ejemplo.com           (muestra qué haría, no cambia nada)
//   npm run empresa:alta -- --nombre "Mi Empresa" --email dueno@ejemplo.com --confirmar
//
// Para sumar otro usuario a una empresa:   --proyecto <id>   --rol member
// Para asignar un usuario ya existente a la única empresa de la base (actualizar un cliente actual):   --proyecto unico
// Usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local. Con --confirmar escribe en esa base.
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { ejecutar, planificar, type Deps, type Options, type Role } from "./empresa-core";

const AYUDA = `Uso: npm run empresa:alta -- --email <email> (--nombre <empresa> | --proyecto <id|unico>) [opciones]

  --nombre     Nombre de la empresa nueva.
  --proyecto   Empresa existente: su id, o "unico" si la base tiene una sola.
  --email      Email del usuario (dueño o miembro).
  --clave      Contraseña inicial de un usuario nuevo (mínimo 8 caracteres). Si falta, se genera una y se muestra al final.
  --rol        owner (dueño, por defecto) o member (miembro).
  --mover      Cambia de empresa a un usuario que ya pertenece a otra.
  --confirmar  Hace los cambios. Sin esto solo muestra qué haría.`;

function realDeps(): { deps: Deps; host: string } {
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`); };
  const deps: Deps = {
    async findUserByEmail(email) {
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        fail("No se pudo listar los usuarios", error);
        const hit = data.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) return { id: hit.id };
        if (data.users.length < 200) return null;
      }
      return null;
    },
    async createUser(email, password) {
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      fail("No se pudo crear el usuario", error);
      return { id: data.user!.id };
    },
    async listProjects(limit) {
      const { data, error } = await sb.from("projects").select("id,name").order("created_at").limit(limit);
      fail("No se pudo leer las empresas", error);
      return (data ?? []) as { id: string; name: string }[];
    },
    async getProject(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await sb.from("projects").select("id,name").eq("id", id).maybeSingle();
      fail("No se pudo leer la empresa", error);
      return (data as { id: string; name: string } | null) ?? null;
    },
    async createProject(name) {
      const { data, error } = await sb.from("projects").insert({ name }).select("id").single();
      fail("No se pudo crear la empresa", error);
      const id = (data as { id: string }).id;
      // Configuración inicial vacía (los valores por defecto los pone la base).
      const r = await sb.from("project_settings").insert({ project_id: id });
      if (r.error) { await sb.from("projects").delete().eq("id", id); fail("No se pudo crear la configuración de la empresa", r.error); }
      return { id };
    },
    async deleteProject(id) {
      const { error } = await sb.from("projects").delete().eq("id", id);
      fail("No se pudo deshacer la empresa", error);
    },
    async getMembership(userId) {
      const { data, error } = await sb.from("project_members").select("project_id,role").eq("user_id", userId).maybeSingle();
      fail("No se pudo leer la pertenencia del usuario", error);
      return data ? { projectId: (data as { project_id: string }).project_id, role: (data as { role: Role }).role } : null;
    },
    async setMembership(userId, projectId, role) {
      const { error } = await sb.from("project_members").upsert({ user_id: userId, project_id: projectId, role });
      fail("No se pudo asignar el usuario a la empresa", error);
    },
  };
  return { deps, host: new URL(url).host };
}

async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: "string" }, proyecto: { type: "string" }, email: { type: "string" }, clave: { type: "string" },
      rol: { type: "string", default: "owner" }, mover: { type: "boolean", default: false }, confirmar: { type: "boolean", default: false }, ayuda: { type: "boolean", default: false },
    },
  });
  if (values.ayuda || !values.email) { console.log(AYUDA); process.exit(values.ayuda ? 0 : 1); }

  const { deps, host } = realDeps();
  const o: Options = { nombre: values.nombre, proyecto: values.proyecto, email: values.email, clave: values.clave, rol: values.rol as Role, mover: values.mover };
  const plan = await planificar(o, deps);

  console.log(`Base de datos: ${host}`);
  console.log(plan.empresa.accion === "crear" ? `Empresa:  se crea "${plan.empresa.nombre}"` : `Empresa:  se usa "${plan.empresa.nombre}" (${plan.empresa.id})`);
  console.log(plan.usuario.accion === "crear" ? `Usuario:  se crea ${plan.usuario.email}` : `Usuario:  ya existe ${plan.usuario.email} (no se le cambia la contraseña)`);
  console.log(`Rol:      ${plan.rol === "owner" ? "dueño" : "miembro"}`);
  console.log(`Pertenencia: ${plan.membresia === "crear" ? "se asigna a la empresa" : plan.membresia === "mover" ? "se actualiza (cambia de empresa o de rol)" : "ya estaba así, no hay nada que cambiar"}`);

  if (!values.confirmar) { console.log("\nNo se cambió nada. Para hacerlo, volvé a correr el comando sumando --confirmar."); return; }

  const r = await ejecutar(plan, deps);
  console.log("\nListo.");
  console.log(`Empresa: ${r.projectId}${r.empresaCreada ? " (nueva)" : ""}`);
  console.log(`Usuario: ${r.email}${r.usuarioCreado ? " (nuevo)" : ""}`);
  if (r.clave) console.log(`Contraseña inicial: ${r.clave}\nPasásela a la persona por un medio seguro: no se vuelve a mostrar.`);
}

main().catch((e) => { console.error(`\nError: ${(e as Error).message}`); process.exit(1); });
