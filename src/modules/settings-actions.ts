"use server";

import { quickFromLines } from "./quick-replies";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasValidSession } from "@/core/session";
import { getDb, persist } from "./data";
import { activeProjectId, service } from "./repo/supabase";
import { fontOk } from "@/lib/fonts";
import type { BrandInfo, CompanyInfo } from "./types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => { const n = Number(String(fd.get(k) ?? "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
const done = (tab: string): never => { revalidatePath("/", "layout"); redirect(`/configuracion?tab=${tab}&ok=1`); };

/** Datos de la empresa (nombre comercial, razón social, CUIT, domicilio, contacto). */
export async function saveCompany(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const db = await getDb();
  const name = str(fd, "name");
  if (!name) throw new Error("Falta el nombre comercial.");
  db.settings.name = name;
  const keys: (keyof CompanyInfo)[] = ["legalName", "cuit", "taxCondition", "address", "city", "province", "zip", "phone", "whatsapp", "email", "website", "instagram", "accountantName", "accountantPhone", "accountantEmail", "holderName", "holderDoc", "holderAddress", "holderPhone", "holderEmail"];
  db.settings.company = { ...db.settings.company, ...Object.fromEntries(keys.filter((k) => fd.has(k)).map((k) => [k, str(fd, k)])) } as CompanyInfo;
  await persist(db);
  done("empresa");
}

/** Datos del contador o la contadora (desde Reportes). No toca el resto de los datos de la empresa. */
export async function saveAccountant(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const email = str(fd, "accountantEmail");
  if (email && !/.+@.+\..+/.test(email)) throw new Error("El correo no parece válido.");
  const db = await getDb();
  db.settings.company = { ...db.settings.company, accountantName: str(fd, "accountantName"), accountantPhone: str(fd, "accountantPhone"), accountantEmail: email };
  await persist(db);
  revalidatePath("/reportes");
  revalidatePath("/configuracion");
}

/** Cantidad de seguidores de la cuenta de Mercado Libre (la API no los informa: se cargan a mano, con la fecha). */
export async function saveMlFollowers(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const n = Number(str(fd, "followers").replace(/\./g, "").replace(",", "."));
  if (!Number.isInteger(n) || n < 0) throw new Error("Escribí un número entero, 0 o más.");
  const db = await getDb();
  db.settings.company = { ...db.settings.company, mlFollowers: n, mlFollowersAt: new Date().toISOString().slice(0, 10) };
  await persist(db);
  revalidatePath("/mercadolibre");
}

/** Chofer de reparto (desde Envíos). No toca el resto de los datos de la empresa. */
export async function saveDriver(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const db = await getDb();
  const driverName = str(fd, "driverName");
  const driverActive = !!driverName && str(fd, "driverActive") === "si";
  db.settings.company = { ...db.settings.company, driverName, driverActive, driverPhone: str(fd, "driverPhone"), driverVehicle: str(fd, "driverVehicle"), driverPlate: str(fd, "driverPlate").toUpperCase() };
  if (!driverActive) {
    // Chofer sin usar (o sin cargar): no figura en ningún envío en curso (los ya entregados conservan quién los llevó).
    for (const x of db.shipments ?? []) {
      if (["entregado", "no_entregado", "volvio"].includes(x.stage)) continue;
      x.courier = ""; x.courierPhone = ""; x.vehicle = ""; x.plate = "";
    }
  }
  await persist(db);
  for (const path of ["/envios", "/"]) revalidatePath(path);
}

/** Reglas de entrega: días de reparto, horario, retiro de la logística y días sin reparto. */
export async function saveDelivery(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const days = fd.getAll("day").map((v) => Number(v)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!days.length) throw new Error("Elegí al menos un día de reparto.");
  const hour = (k: string) => { const v = str(fd, k); if (v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error("Escribí las horas así: 14:00."); return v; };
  const off = str(fd, "deliveryOff").split(/[\s,;]+/).filter(Boolean);
  if (off.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error("Los días sin reparto van como AAAA-MM-DD, por ejemplo 2026-12-25.");
  const db = await getDb();
  db.settings.company = { ...db.settings.company, deliveryDays: [...new Set(days)].sort(), deliveryFrom: hour("deliveryFrom"), pickupFrom: hour("pickupFrom"), pickupTo: hour("pickupTo"), deliveryOff: off };
  await persist(db);
  for (const path of ["/configuracion", "/envios"]) revalidatePath(path);
}

/** Ajustes generales del sistema: moneda, país, impuesto y costos estimados. */
export async function saveSystem(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const db = await getDb();
  const s = db.settings;
  s.currency = str(fd, "currency") || s.currency;
  s.country = str(fd, "country") || s.country;
  s.taxPct = num(fd, "taxPct");
  s.costs = { logisticsPerShipment: num(fd, "logistics"), boxPerPack: num(fd, "boxPerPack"), gncPct: num(fd, "gncPct") };
  await persist(db);
  done("sistema");
}

/** Marca: logo (png, jpg o webp, hasta 2 MB), frase, color y texto al pie de los presupuestos. */
export async function saveBrand(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const db = await getDb();
  const prev: BrandInfo = db.settings.brand ?? {};
  const color = str(fd, "color"), color2 = str(fd, "color2");
  const font = (k: string, old?: string) => { const v = str(fd, k); return fontOk(v) ? v : old; };
  const brand: BrandInfo = {
    ...prev, tagline: str(fd, "tagline"), quoteFooter: str(fd, "quoteFooter"), color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : prev.color, color2: /^#[0-9a-fA-F]{6}$/.test(color2) ? color2 : prev.color2,
    fontTitle: font("fontTitle", prev.fontTitle), fontSubtitle: font("fontSubtitle", prev.fontSubtitle), fontText: font("fontText", prev.fontText),
  };

  const file = fd.get("logo");
  if (fd.get("removeLogo") === "1") brand.logoUrl = "";
  else if (file instanceof File && file.size > 0) {
    const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[file.type];
    if (!ext) throw new Error("El logo tiene que ser PNG, JPG o WEBP.");
    if (file.size > 2 * 1024 * 1024) throw new Error("El logo pesa más de 2 MB. Probá con una imagen más liviana.");
    const path = `${await activeProjectId()}/logo-${Date.now()}.${ext}`;
    const { error } = await service().storage.from("brand").upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw new Error(`No se pudo subir el logo: ${error.message}`);
    brand.logoUrl = service().storage.from("brand").getPublicUrl(path).data.publicUrl;
  }
  db.settings.brand = brand;
  await persist(db);
  done("marca");
}

/** Respuestas rápidas de las mensajerías: una por línea, "Título | texto". Vacío = vuelven las que vienen armadas. */
export async function saveQuickReplies(fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const list = quickFromLines(String(fd.get("replies") ?? ""));
  const db = await getDb();
  db.settings.company = { ...db.settings.company, quickReplies: list };
  await persist(db);
  for (const path of ["/configuracion", "/envios", "/clientes", "/ventas", "/mensajes"]) revalidatePath(path);
}
