"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { hasValidSession } from "@/core/session";
import { MAX_MSG, MAX_MSGS, splitMessages } from "@/modules/quick-replies";
import { demoAnswer, demoReply } from "@/modules/demo/mercadolibre";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import { MlError, mlGet, mlPost } from "./client";
import { conversationIdOf } from "./data";
import { autoWelcome, sendWelcomeMessages, closeDelivered, settleRefunds, syncClaims, refreshRecentConversations, backfill, drain, processJob, queueMissingShipments } from "./sync";

const BG_MS = process.env.VERCEL ? 50_000 : 240_000; // Vercel corta la función a los 60 s


/** Botón "Sincronizar ahora": trae solo lo nuevo desde la última vez y lo procesa en segundo plano. */
export async function syncNow() {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await backfill(projectId);
  after(() => drain(projectId, "manual", BG_MS).then(() => autoWelcome(projectId)).then(() => refreshRecentConversations(projectId)).then(() => closeDelivered(projectId)).then(() => syncClaims(projectId)).then(() => settleRefunds(projectId)).catch(() => {}));
  revalidatePath("/mercadolibre");
}

/** Crea un producto del catálogo a partir de una publicación de Mercado Libre y lo vincula (con sus ventas ya cargadas). */
export async function createProductFromListing(itemId: string, fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  const sb = service();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("Falta el nombre.");
  const id = `p_${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await sb.from("products").insert({
    id, project_id: projectId, sku: String(fd.get("sku") ?? "").trim() || `ML-${itemId.replace("MLA", "")}`, name, category: String(fd.get("category") ?? "").trim(),
    unit: "unidad", cost: Number(fd.get("cost") ?? 0) || 0, price: Number(fd.get("price") ?? 0) || 0, track_stock: String(fd.get("trackStock") ?? "no") === "si", kind: "venta",
  });
  if (error) throw new Error(`No se pudo crear el producto: ${error.message}`);
  const category = String(fd.get("category") ?? "").trim();
  if (category) {
    const { data: st } = await sb.from("project_settings").select("categories").eq("project_id", projectId).single();
    if (st && !(st.categories as string[]).includes(category)) await sb.from("project_settings").update({ categories: [...(st.categories as string[]), category] }).eq("project_id", projectId);
  }
  const link = new FormData();
  link.set("productId", id);
  await linkMlItem(itemId, link);
}

/** Vincula una publicación de Mercado Libre con un producto interno y unifica las ventas que ya se habían cargado. */
export async function linkMlItem(itemId: string, fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  const sb = service();
  const productId = String(fd.get("productId") ?? "");
  if (!productId) {
    await sb.from("ml_item_links").delete().eq("project_id", projectId).eq("ml_item_id", itemId);
  } else {
    const { error } = await sb.from("ml_item_links").upsert({ project_id: projectId, ml_item_id: itemId, product_id: productId });
    if (error) throw new Error(error.message);
    // Ventas que apuntaban al producto automático de esa publicación pasan al producto elegido.
    const auto = `mli_${itemId}`;
    if (auto !== productId) {
      const { data: sales } = await sb.from("sales").select("id,items").eq("project_id", projectId).contains("items", [{ productId: auto }]);
      for (const s of sales ?? []) {
        const items = (s.items as { productId: string }[]).map((i) => (i.productId === auto ? { ...i, productId } : i));
        await sb.from("sales").update({ items }).eq("id", s.id);
      }
      const { count } = await sb.from("sales").select("id", { count: "exact", head: true }).eq("project_id", projectId).contains("items", [{ productId: auto }]);
      if (!count) await sb.from("products").delete().eq("project_id", projectId).eq("id", auto);
    }
  }
  revalidatePath("/mercadolibre");
  revalidatePath("/productos");
  revalidatePath("/");
}

/** Recarga TODO el historial desde cero. Solo para casos excepcionales (datos que no cierran). */
export async function reloadAll() {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await backfill(projectId, { full: true });
  after(() => drain(projectId, "recarga completa", BG_MS).catch(() => {}));
  revalidatePath("/mercadolibre");
}

const NEEDS_PERMISSION = "Mercado Libre no dejó enviar: falta el permiso de escritura. Cambialo en el panel de desarrolladores y tocá “Volver a autorizar” en Mercado Libre → Resumen.";
function friendly(e: unknown): Error {
  // Un 401/403 en una sola compra no siempre es falta de permiso de la app: se muestra el detalle real que informa Mercado Libre.
  if (e instanceof MlError && [401, 403].includes(e.status)) return new Error(`${e.status === 401 ? NEEDS_PERMISSION : "Mercado Libre no lo permitió."} Detalle: ${e.message}`);
  return new Error(e instanceof Error ? e.message : "No se pudo enviar.");
}

/** Cambia precio, stock o estado (activa / pausada) de una publicación de Mercado Libre y actualiza lo guardado en el CRM. */
export async function updateMlItem(itemId: string, fd: FormData) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  if (!/^MLA\d+$/.test(itemId)) throw new Error("Publicación no válida.");
  const projectId = await activeProjectId();
  const price = String(fd.get("price") ?? "").trim(), qty = String(fd.get("available") ?? "").trim(), status = String(fd.get("status") ?? "").trim();
  const newPrice = price ? Number(price) : undefined, newQty = qty ? Number(qty) : undefined;
  if (newPrice !== undefined && !(newPrice > 0)) throw new Error("El precio debe ser mayor a cero.");
  if (newQty !== undefined && (!Number.isInteger(newQty) || newQty < 0)) throw new Error("El stock debe ser un número entero, 0 o más.");
  if (status && !["active", "paused"].includes(status)) throw new Error("Estado no válido.");

  // Se compara contra lo que figura hoy en Mercado Libre (no contra la copia guardada, que puede estar desactualizada).
  type Live = { price?: number; available_quantity?: number; status?: string; sub_status?: string[]; variations?: { id: number; price?: number; available_quantity?: number }[] };
  let live: Live;
  try { live = await mlGet<Live>(projectId, `/items/${itemId}`, { attributes: "id,price,available_quantity,status,sub_status,variations" }); } catch (e) { throw friendly(e); }
  const variations = live.variations ?? [];

  const body: Record<string, unknown> = {};
  const priceChanged = newPrice !== undefined && newPrice !== live.price;
  const qtyChanged = newQty !== undefined && newQty !== live.available_quantity;
  if (variations.length) {
    // Con variantes, el precio y el stock se mandan por variante.
    if (qtyChanged && variations.length > 1) throw new Error(`Esta publicación tiene ${variations.length} variantes: el stock se edita por variante directamente en Mercado Libre. El precio y el estado sí se pueden cambiar desde acá.`);
    if (priceChanged || qtyChanged) {
      body.variations = variations.map((v) => ({ id: v.id, ...(priceChanged ? { price: newPrice } : {}), ...(qtyChanged ? { available_quantity: newQty } : {}) }));
    }
  } else {
    if (priceChanged) body.price = newPrice;
    if (qtyChanged) body.available_quantity = newQty;
  }
  const statusChanged = !!status && status !== live.status;
  if (!Object.keys(body).length && !statusChanged) throw new Error("No cambiaste nada: lo que figura hoy en Mercado Libre ya es igual.");
  if (status === "active" && live.status !== "active" && (newQty ?? live.available_quantity ?? 0) < 1) throw new Error("No se puede activar una publicación sin stock: cargá primero un stock de 1 o más.");
  if (statusChanged && !["active", "paused"].includes(live.status ?? "")) throw new Error(`Mercado Libre la tiene en estado "${live.status}"${live.sub_status?.length ? ` (${live.sub_status.join(", ")})` : ""}: no se puede activar ni pausar desde acá.`);

  // Primero precio/stock y después el estado, en pedidos separados (así un error en uno no deja todo a medias sin avisar).
  const done: string[] = [];
  try {
    if (Object.keys(body).length) { await mlPost(projectId, `/items/${itemId}`, body, undefined, "PUT"); done.push(priceChanged && qtyChanged ? "precio y stock" : priceChanged ? "precio" : "stock"); }
    if (statusChanged) { await mlPost(projectId, `/items/${itemId}`, { status }, undefined, "PUT"); done.push("estado"); }
  } catch (e) {
    const err = friendly(e);
    throw new Error(done.length ? `Se cambió ${done.join(" y ")}, pero ${err.message.charAt(0).toLowerCase()}${err.message.slice(1)}` : err.message);
  }
  await processJob(projectId, "items", `/items/${itemId}`).catch(() => {});
  // El precio del catálogo acompaña al de Mercado Libre.
  if (priceChanged) {
    const { data: link } = await service().from("ml_item_links").select("product_id").eq("project_id", projectId).eq("ml_item_id", itemId).maybeSingle();
    if (link) await service().from("products").update({ price: newPrice }).eq("project_id", projectId).eq("id", link.product_id);
  }
  for (const path of ["/mercadolibre", "/productos", "/stock", "/"]) revalidatePath(path);
}

/** Responde a un comprador por la mensajería post-venta de Mercado Libre y actualiza la conversación guardada. */
/** Resultado de una acción de formulario: con "error" el formulario muestra el motivo (si se lanzara el error, producción lo oculta). */
export type ActionResult = void | { error: string };

export async function replyToBuyer(packId: string, buyerId: string, fd: FormData): Promise<ActionResult> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  // Hasta 3 mensajes seguidos, separados por una línea que diga solo "---" (Mercado Libre acepta 350 caracteres por mensaje).
  const parts = splitMessages(String(fd.get("text") ?? ""));
  if (!parts.length) return { error: "Escribí el mensaje." };
  if (parts.length > MAX_MSGS) return { error: `Se pueden mandar hasta ${MAX_MSGS} mensajes seguidos (escribiste ${parts.length}).` };
  const tooLong = parts.findIndex((m) => m.length > MAX_MSG);
  if (tooLong >= 0) return { error: `Mercado Libre acepta hasta ${MAX_MSG} caracteres por mensaje (${parts.length > 1 ? `el mensaje ${tooLong + 1} tiene` : "escribiste"} ${parts[tooLong].length}).` };
  if (!isSupabase()) { demoReply(packId, parts.join("\n")); revalidatePath("/mercadolibre"); return; } // demostración: queda solo en pantalla
  const projectId = await activeProjectId();
  const { data: acc } = await service().from("ml_accounts").select("ml_user_id").eq("project_id", projectId).single();
  if (!acc) return { error: "Mercado Libre no está conectado." };
  const seller = String(acc.ml_user_id);
  // Si la compra es un pack (varias órdenes juntas), Mercado Libre pide el número del pack.
  packId = await conversationIdOf(projectId, packId);
  let sent = 0;
  let failure: string | null = null;
  for (const text of parts) {
    try {
      await mlPost(projectId, `/messages/packs/${packId}/sellers/${seller}`, { from: { user_id: seller }, to: { user_id: buyerId }, text }, { tag: "post_sale" });
      sent++;
    } catch (e) { failure = friendly(e).message; break; }
  }
  if (sent) {
    await processJob(projectId, "conversation", packId).catch(() => {});
    revalidatePath("/mercadolibre");
  }
  if (failure) return { error: parts.length > 1 ? `Se mandaron ${sent} de ${parts.length}. Mercado Libre no aceptó el mensaje ${sent + 1}: ${failure}` : `Mercado Libre no aceptó el mensaje: ${failure}` };
}

/** Responde una pregunta de una publicación. */
export async function answerQuestion(questionId: string, fd: FormData): Promise<ActionResult> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const text = String(fd.get("text") ?? "").trim();
  if (!text) return { error: "Escribí la respuesta." };
  if (text.length > 2000) return { error: "La respuesta es demasiado larga (máximo 2000 caracteres)." };
  if (!isSupabase()) { demoAnswer(questionId, text); revalidatePath("/mercadolibre"); return; } // demostración: queda solo en pantalla
  const projectId = await activeProjectId();
  try {
    await mlPost(projectId, "/answers", { question_id: Number(questionId), text });
  } catch (e) { return { error: `Mercado Libre no aceptó la respuesta: ${friendly(e).message}` }; }
  await processJob(projectId, "questions", `/questions/${questionId}`).catch(() => {});
  revalidatePath("/mercadolibre");
}

/** Botón "Traer envíos de ML": completa el seguimiento con los envíos (estado, dirección, fechas) de las órdenes ya cargadas. */
export async function importMlShipments() {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  await queueMissingShipments(projectId);
  after(() => drain(projectId, "manual", BG_MS).catch(() => {}));
  revalidatePath("/envios");
}

/** Enciende o apaga el envío automático de la bienvenida (solo compras de productos). */
export async function setWelcomeAuto(on: boolean) {
  if (!(await hasValidSession())) throw new Error("No autorizado.");
  const projectId = await activeProjectId();
  const sb = service();
  const { data } = await sb.from("project_settings").select("company").eq("project_id", projectId).single();
  await sb.from("project_settings").update({ company: { ...((data?.company ?? {}) as Record<string, unknown>), welcomeAuto: on } }).eq("project_id", projectId);
  // Al encender, alcanza también a las compras de productos de las últimas 24 h que entraron antes.
  if (on) await autoWelcome(projectId).catch(() => {});
  revalidatePath("/mercadolibre");
  revalidatePath("/ventas");
}

/** Primer mensaje al comprador: envía los tres mensajes de bienvenida y lo marca como enviado; la tarjeta sigue en "Nuevos compradores" hasta que se la saque a mano. */
export async function welcomeBuyer(saleId: string, packId: string, buyerId: string): Promise<ActionResult> {
  if (!(await hasValidSession())) return { error: "No autorizado." };
  const projectId = await activeProjectId();
  const { data: acc } = await service().from("ml_accounts").select("ml_user_id").eq("project_id", projectId).single();
  if (!acc) return { error: "Mercado Libre no está conectado." };
  const { data: st } = await service().from("project_settings").select("company").eq("project_id", projectId).single();
  // Se reserva antes de escribir (un doble clic o una sincronización a la vez mandarían todo dos veces).
  const { data: claimed } = await service().from("sales").update({ welcome_sent_at: new Date().toISOString().slice(0, 10), welcome_by: "manual" }).eq("id", saleId).is("welcome_sent_at", null).select("id");
  if (!claimed?.length) return { error: "La bienvenida de esta compra ya se envió." };
  try {
    await sendWelcomeMessages(projectId, await conversationIdOf(projectId, packId), String(acc.ml_user_id), buyerId, st?.company as Parameters<typeof sendWelcomeMessages>[4]);
  } catch (e) {
    await service().from("sales").update({ welcome_sent_at: null, welcome_by: null }).eq("id", saleId);
    return { error: `Mercado Libre no aceptó el mensaje: ${friendly(e).message}` };
  }
  await processJob(projectId, "conversation", await conversationIdOf(projectId, packId)).catch(() => {});
  revalidatePath("/mercadolibre");
  revalidatePath("/ventas");
}
