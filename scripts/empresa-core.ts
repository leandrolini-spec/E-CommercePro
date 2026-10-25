// Lógica del alta de empresas y usuarios, separada de Supabase para poder probarla.
import { randomBytes } from "node:crypto";

export type Role = "owner" | "member";

export type Options = {
  /** Nombre de la empresa nueva (si no se indica "proyecto"). */
  nombre?: string;
  email: string;
  /** Contraseña inicial de un usuario nuevo. Si falta, se genera una. */
  clave?: string;
  rol: Role;
  /** Empresa existente: su id, o "unico" para la única que haya en la base. */
  proyecto?: string;
  /** Permite cambiar de empresa a un usuario que ya pertenece a otra. */
  mover: boolean;
};

export type Deps = {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUser(email: string, password: string): Promise<{ id: string }>;
  listProjects(limit: number): Promise<{ id: string; name: string }[]>;
  getProject(id: string): Promise<{ id: string; name: string } | null>;
  createProject(name: string): Promise<{ id: string }>;
  deleteProject(id: string): Promise<void>;
  getMembership(userId: string): Promise<{ projectId: string; role: Role } | null>;
  setMembership(userId: string, projectId: string, role: Role): Promise<void>;
};

/** Lo que se va a hacer, calculado sin tocar nada. */
export type Plan = {
  empresa: { accion: "crear"; nombre: string } | { accion: "usar"; id: string; nombre: string };
  usuario: { accion: "crear"; email: string; clave: string; claveGenerada: boolean } | { accion: "usar"; email: string; id: string };
  rol: Role;
  membresia: "crear" | "ya-estaba" | "mover";
};

export type Result = { projectId: string; userId: string; email: string; rol: Role; clave?: string; empresaCreada: boolean; usuarioCreado: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const generarClave = () => randomBytes(15).toString("base64url");

/** Revisa los datos y arma el plan. Lanza un Error con un mensaje claro si algo no se puede hacer. */
export async function planificar(o: Options, d: Deps): Promise<Plan> {
  const email = o.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`El email "${o.email}" no es válido.`);
  if (o.rol !== "owner" && o.rol !== "member") throw new Error('El rol debe ser "owner" (dueño) o "member" (miembro).');
  if (o.clave !== undefined && o.clave.length < 8) throw new Error("La contraseña inicial debe tener al menos 8 caracteres.");

  // Empresa
  let empresa: Plan["empresa"];
  if (o.proyecto) {
    let found: { id: string; name: string } | null;
    if (o.proyecto === "unico") {
      const all = await d.listProjects(2);
      if (all.length !== 1) throw new Error(all.length ? "Hay más de una empresa en la base: indicá su id con --proyecto <id>." : "No hay ninguna empresa en la base: creala con --nombre.");
      found = all[0];
    } else {
      found = await d.getProject(o.proyecto);
      if (!found) throw new Error(`No existe una empresa con el id ${o.proyecto}.`);
    }
    if (o.nombre) throw new Error("Usá --nombre para una empresa nueva o --proyecto para una existente, no los dos.");
    empresa = { accion: "usar", id: found.id, nombre: found.name };
  } else {
    const nombre = (o.nombre ?? "").trim();
    if (!nombre) throw new Error("Falta el nombre de la empresa (--nombre) o la empresa existente (--proyecto).");
    empresa = { accion: "crear", nombre };
  }

  // Usuario
  const existing = await d.findUserByEmail(email);
  if (existing && o.clave !== undefined) throw new Error(`Ya existe un usuario con ${email}: no se le cambia la contraseña desde acá. Sacá --clave.`);
  const usuario: Plan["usuario"] = existing
    ? { accion: "usar", email, id: existing.id }
    : { accion: "crear", email, clave: o.clave ?? generarClave(), claveGenerada: o.clave === undefined };

  // Membresía
  let membresia: Plan["membresia"] = "crear";
  if (existing) {
    const m = await d.getMembership(existing.id);
    if (m) {
      const mismo = empresa.accion === "usar" && m.projectId === empresa.id;
      if (mismo && m.role === o.rol) membresia = "ya-estaba";
      else if (mismo || o.mover) membresia = "mover";
      else throw new Error(`${email} ya pertenece a otra empresa. Si querés cambiarlo de empresa, sumá --mover.`);
    }
  }
  return { empresa, usuario, rol: o.rol, membresia };
}

/** Ejecuta el plan. Si falla a la mitad lo explica con claridad; volver a correr el comando es seguro. */
export async function ejecutar(p: Plan, d: Deps): Promise<Result> {
  const empresaCreada = p.empresa.accion === "crear";
  const projectId = p.empresa.accion === "crear" ? (await d.createProject(p.empresa.nombre)).id : p.empresa.id;
  const usuarioCreado = p.usuario.accion === "crear";
  let userId: string;
  try {
    userId = p.usuario.accion === "crear" ? (await d.createUser(p.usuario.email, p.usuario.clave)).id : p.usuario.id;
  } catch (e) {
    // No dejar una empresa vacía sin dueño si el usuario no se pudo crear.
    if (empresaCreada) await d.deleteProject(projectId).catch(() => {});
    throw e;
  }
  try {
    if (p.membresia !== "ya-estaba") await d.setMembership(userId, projectId, p.rol);
  } catch (e) {
    const hecho = [empresaCreada ? `la empresa (${projectId})` : "", usuarioCreado ? `el usuario ${p.usuario.email}` : ""].filter(Boolean).join(" y ");
    throw new Error(`${(e as Error).message}${hecho ? ` Ya se crearon ${hecho}: para terminar, volvé a correr el comando con --proyecto ${projectId}${usuarioCreado ? " (sin --clave: el usuario ya existe y conserva su contraseña inicial)" : ""}.` : ""}`);
  }
  return { projectId, userId, email: p.usuario.email, rol: p.rol, clave: p.usuario.accion === "crear" ? p.usuario.clave : undefined, empresaCreada, usuarioCreado };
}
