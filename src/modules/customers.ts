import type { Customer } from "./types";

/** Un teléfono cargado de verdad: al menos 6 números (no vale "XXXXXXX" ni un guion). */
export const hasPhone = (phone?: string) => (phone ?? "").replace(/\D/g, "").length >= 6;

/**
 * La Agenda es automática: entra el contacto que tiene teléfono (el resto de los datos se pide y se completa después).
 * Si se le borra el teléfono, sale solo; si se lo carga, entra solo. `agendaOff` es cuando se lo saca a mano.
 */
export const inAgenda = (c: { name?: string; phone?: string; address?: string; agendaOff?: boolean }) => !c.agendaOff && hasPhone(c.phone);

/** Un comprador de Mercado Libre que todavía figura con su usuario (sin nombre real): una sola palabra, sin apodo guardado. */
export const looksLikeUser = (c?: Pick<Customer, "id" | "name" | "nickname">) =>
  !!c && c.id.startsWith("mlb_") && !c.nickname && !/\s/.test(c.name.trim());

/** Usuario de Mercado Libre de un comprador (el apodo guardado, o el propio nombre si todavía es el usuario). Se muestra siempre y no se edita. */
export const mlUserOf = (c?: Pick<Customer, "id" | "name" | "nickname">) => (!c ? "" : c.nickname || (looksLikeUser(c) ? c.name : ""));

/** La compra ya tuvo su bienvenida: la marcó una persona (tilde) o salió sola (bienvenida automática). Desde ahí está en "Esperando datos" mientras no tenga teléfono. */
export const isWelcomed = (s: { welcomed?: boolean; welcomeBy?: string }) => !!s.welcomed || s.welcomeBy === "auto";
