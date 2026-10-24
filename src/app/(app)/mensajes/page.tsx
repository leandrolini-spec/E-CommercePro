import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ContactButtons } from "@/components/shared/ContactButtons";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, PageHeader, param, type SearchParams } from "@/components/shared/list";
import { ReplyForm } from "@/components/shared/ReplyForm";
import { DetectedData, newDetected } from "@/components/shared/DetectedData";
import { PasteData } from "@/components/shared/PasteData";
import { extractFromMessages } from "@/modules/extract";
import { saveAlerts, saveAndTestAlerts } from "@/modules/alerts-actions";
import { Guide } from "@/components/ui/Guide";
import { Badge } from "@/components/ui/primitives";
import { answerQuestion, replyToBuyer } from "@/integrations/mercadolibre/actions";
import { mlData } from "@/integrations/mercadolibre/data";
import { fdate, isoDaysAgo, money } from "@/lib/format";
import { saleTotals } from "@/modules/calc";
import { quickFor, quickForQuestion } from "@/modules/quick-replies";
import { saveCustomerData } from "@/modules/actions";
import { inAgenda, looksLikeUser, mlUserOf } from "@/modules/customers";
import { metaConfigured } from "@/lib/meta-webhook";
import { getDb } from "@/modules/data";
import { listThreads, threadMessages, type InboxChannel } from "@/modules/inbox";
import { markAllRead, markMlRead, setThreadState } from "@/modules/inbox-actions";
import { doneKey, isCourtesy, markKeysRead, mlMsgKey, mlQuestionKey, readKeys } from "@/modules/message-reads";
import { activeProjectId, isSupabase } from "@/modules/repo/supabase";

/** Colores de cada canal: se usan en la carpeta, en el borde de cada conversación y en su etiqueta. */
const CH: Record<InboxChannel, { label: string; color: string; soft: string; text: string }> = {
  mercadolibre: { label: "Mercado Libre", color: "#ffe600", soft: "#fff9c2", text: "#2d3277" },
  tiendanube: { label: "Tienda Nube", color: "#1f4fbf", soft: "#e4ecff", text: "#1f4fbf" },
  whatsapp: { label: "WhatsApp", color: "#25d366", soft: "#dcf8e6", text: "#0f7a6b" },
  instagram: { label: "Instagram", color: "#c13584", soft: "#fbe3f0", text: "#a02a6c" },
};
const TYPE: Record<string, { label: string; icon: string }> = {
  pregunta: { label: "Pregunta", icon: "?" }, mensaje: { label: "Mensaje", icon: "✉" }, nota: { label: "Nota de compra", icon: "✎" }, carrito: { label: "Carrito abandonado", icon: "🛒" },
};

type Folder = "ml-preguntas" | "ml-mensajes" | "tn-notas" | "tn-carritos" | "whatsapp" | "instagram";
const GROUPS: { channel: InboxChannel; folders: { key: Folder; label: string }[] }[] = [
  { channel: "mercadolibre", folders: [{ key: "ml-preguntas", label: "Preguntas" }, { key: "ml-mensajes", label: "Mensajes" }] },
  { channel: "tiendanube", folders: [{ key: "tn-notas", label: "Notas de compra" }, { key: "tn-carritos", label: "Carritos abandonados" }] },
  { channel: "whatsapp", folders: [{ key: "whatsapp", label: "Conversaciones" }] },
  { channel: "instagram", folders: [{ key: "instagram", label: "Mensajes directos" }] },
];
const STATES = [["abiertos", "Abiertos"], ["sinleer", "Sin leer"], ["antiguas", "Antiguas"], ["resueltos", "Resueltos"], ["todos", "Todos"]] as const;
/** Una consulta abierta con más de 7 días ya no es "para responder ahora": pasa a Antiguas para no tapar lo reciente. */

type Msg = { id: string; out: boolean; body: string; at: string };
type Item = {
  id: string; channel: InboxChannel; kind: string; name: string; subject: string; preview: string; at: string; unread: boolean; open: boolean;
  phone: string; email: string; handle: string; customerId: string | null; link: string; saved: boolean;
  /** Cómo se responde desde acá (solo Mercado Libre). */
  reply?: { type: "question"; id: string } | { type: "buyer"; packId: string; buyerId: string };
  /** Clave para marcar como leído un mensaje o pregunta de Mercado Libre desde el CRM. */
  readKey?: string;
  messages?: Msg[]; itemUrl?: string;
};

/** Punto de estado: azul = sin leer, naranja = leída pero sin responder, verde = respondida o resuelta. */
const DOT = { unread: { color: "#2563eb", label: "Sin leer" }, read: { color: "#f59e0b", label: "Leída, falta responder" }, done: { color: "#16a34a", label: "Respondida o resuelta" } } as const;
const dotOf = (t: Pick<Item, "unread" | "open">) => (!t.open ? DOT.done : t.unread ? DOT.unread : DOT.read);

const folderOf = (t: Item): Folder => (t.channel === "mercadolibre" ? (t.kind === "pregunta" ? "ml-preguntas" : "ml-mensajes") : t.channel === "tiendanube" ? (t.kind === "carrito" ? "tn-carritos" : "tn-notas") : t.channel);

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  if (m < 43200) return `hace ${Math.round(m / 1440)} d`;
  return new Date(iso).toLocaleDateString("es-AR");
};
/** Momento exacto (hora argentina) y cuánto lleva esperando una consulta abierta; se pone rojo pasadas las 24 h. */
const when = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const waiting = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const label = m < 60 ? `${Math.max(1, m)} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  return { label, color: m >= 1440 ? "#dc2626" : m >= 360 ? "#d97706" : "#64748b" };
};
const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

function TypeTag({ t }: { t: Item }) {
  const c = CH[t.channel], ty = TYPE[t.kind] ?? { label: t.kind, icon: "•" };
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: c.soft, color: c.text }}>
      <span aria-hidden>{ty.icon}</span>{t.channel === "whatsapp" || t.channel === "instagram" ? c.label : ty.label}
    </span>
  );
}

/** Bandeja única: Mercado Libre (preguntas y mensajes, se responden acá), Tienda Nube, WhatsApp e Instagram. */
export default async function MensajesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supa = isSupabase();
  const projectId = supa ? await activeProjectId() : "";
  // Base, conversaciones guardadas y datos de Mercado Libre se piden al mismo tiempo.
  const [db, savedRows, mlAll, reads] = await Promise.all([
    getDb(),
    supa ? listThreads(projectId).catch(() => []) : Promise.resolve([]),
    supa ? mlData(projectId, { messages: 30 }).catch(() => null) : Promise.resolve(null),
    supa ? readKeys(projectId).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ]);
  const nameOfCustomer = (id: string | null) => db.customers.find((c) => c.id === id)?.name ?? "";

  const items: Item[] = [];
  if (supa) {
    for (const t of savedRows) {
      items.push({
        id: t.id, channel: t.channel, kind: t.kind, name: t.contact_name || "Sin nombre", subject: t.subject, preview: t.last_message, at: t.last_at, unread: t.unread, open: t.status === "abierto",
        phone: t.contact_phone, email: t.contact_email, handle: t.contact_handle, customerId: t.customer_id, link: t.link, saved: true,
      });
    }
    const ml = mlAll;
    if (ml) {
      const since = isoDaysAgo(30);
      for (const q of ml.questions) {
        const pending = q.status === "UNANSWERED" && !reads.has(doneKey(mlQuestionKey(q.id)));
        if (!pending && q.created.slice(0, 10) < since) continue;
        const item = ml.items.find((i) => i.id === q.itemId);
        const buyer = q.buyerId ? `mlb_${q.buyerId}` : null;
        const msgs: Msg[] = [{ id: "q", out: false, body: q.text, at: q.created }];
        if (q.answer) msgs.push({ id: "a", out: true, body: q.answer, at: q.answeredAt ?? q.created });
        items.push({
          id: `ml:q:${q.id}`, channel: "mercadolibre", kind: "pregunta", name: nameOfCustomer(buyer) || "Comprador", subject: item?.title ?? "Publicación de Mercado Libre", preview: q.answer ?? q.text,
          at: q.answeredAt ?? q.created, unread: pending && !reads.has(mlQuestionKey(q.id)), readKey: mlQuestionKey(q.id), open: pending, phone: "", email: "", handle: "", customerId: buyer, link: "/mercadolibre?tab=preguntas", saved: false,
          reply: pending ? { type: "question", id: q.id } : undefined, messages: msgs, itemUrl: item?.permalink,
        });
      }
      const byOrder = new Map<string, typeof ml.messages>();
      for (const m of ml.messages) if (m.orderId) byOrder.set(m.orderId, [...(byOrder.get(m.orderId) ?? []), m]);
      for (const [orderId, list] of byOrder) {
        const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const last = sorted.at(-1)!;
        if (last.date.slice(0, 10) < since) continue;
        const buyerId = sorted.find((m) => m.fromBuyer)?.fromId ?? "";
        const pending = last.fromBuyer && !isCourtesy(last.text) && !reads.has(doneKey(mlMsgKey(orderId, last.id)));
        items.push({
          id: `ml:m:${orderId}`, channel: "mercadolibre", kind: "mensaje", name: nameOfCustomer(`mlb_${buyerId}`) || "Comprador", subject: `Orden ${orderId}`, preview: last.text || "(mensaje vacío o adjunto)", at: last.date,
          unread: pending && !last.read && !reads.has(mlMsgKey(orderId, last.id)), readKey: mlMsgKey(orderId, last.id), open: pending, phone: "", email: "", handle: "", customerId: `mlb_${buyerId}`, link: "/mercadolibre?tab=mensajes", saved: false,
          reply: buyerId ? { type: "buyer", packId: orderId, buyerId } : undefined, messages: sorted.slice(-10).map((m) => ({ id: m.id, out: !m.fromBuyer, body: m.text || "(mensaje vacío o adjunto)", at: m.date })),
        });
      }
    }
  }
  const ts = (iso: string) => Date.parse(iso) || 0;
  items.sort((a, b) => ts(b.at) - ts(a.at));

  // Conversaciones de compradores que todavía no pasaron el teléfono (no entran a la Agenda).
  const customerOf = (t: Item) => db.customers.find((c) => c.id === t.customerId);
  const missingOf = (t: Item): string[] => {
    const c = customerOf(t);
    if (!c || inAgenda(c) || c.agendaOff) return [];
    // La Agenda pide solo el teléfono: es lo único que se marca como faltante.
    return ["teléfono"];
  };
  const onlyMissing = param(sp, "datos") === "1";
  // Compra a la que corresponde la conversación (la orden de Mercado Libre) o, si no, la última del cliente.
  const saleOf = (t: Item) => {
    const orderId = t.id.startsWith("ml:m:") ? t.id.slice(5) : "";
    const exact = orderId ? db.sales.find((x) => x.mlOrderId === orderId) : undefined;
    if (exact) return exact;
    return t.customerId ? [...db.sales].filter((x) => x.customerId === t.customerId && x.status !== "cancelada").sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
  };
  const saleLine = (t: Item) => {
    const sale = saleOf(t);
    if (!sale) return "";
    const what = sale.items.map((i) => `${i.qty} × ${db.products.find((p) => p.id === i.productId)?.name ?? "Producto"}`).join(" · ");
    return `Compró el ${fdate(sale.date)} · ${what} · ${money(saleTotals(db, { ...sale, status: "pendiente" }).revenue)}`;
  };

  const oldBefore = isoDaysAgo(7);
  const isOld = (t: Item) => t.open && t.at.slice(0, 10) < oldBefore;
  const inState = (k: string, t: Item) => (k === "todos" ? true : k === "resueltos" ? !t.open : k === "sinleer" ? t.unread && t.open : k === "antiguas" ? isOld(t) : t.open && !isOld(t));
  const carpeta = GROUPS.flatMap((g) => g.folders).find((f) => f.key === param(sp, "carpeta"))?.key ?? "";
  const estado = STATES.find((s) => s[0] === param(sp, "estado"))?.[0] ?? "abiertos";
  const byEstado = items.filter((t) => inState(estado, t));
  const shown = byEstado.filter((t) => (!carpeta || folderOf(t) === carpeta) && (!onlyMissing || missingOf(t).length > 0));
  const missingCount = byEstado.filter((t) => missingOf(t).length > 0).length;
  const folderCount = (k: string) => byEstado.filter((t) => !k || folderOf(t) === k).length;
  const stateCount = (k: string) => items.filter((t) => (!carpeta || folderOf(t) === carpeta) && inState(k, t)).length;
  const unreadTotal = items.filter((t) => t.unread && t.open).length;
  const mlUnreadKeys = items.filter((t) => !t.saved && t.unread && t.open && t.readKey).map((t) => t.readKey!);

  const selId = param(sp, "hilo");
  const sel = items.find((t) => t.id === selId) ?? null;
  // Abrir una conversación de Mercado Libre la marca como leída.
  if (supa && sel && !sel.saved && sel.readKey && sel.unread) await markKeysRead(projectId, [sel.readKey]).catch(() => {});
  const selMessages: Msg[] = sel ? (sel.messages ?? (await threadMessages(projectId, sel.id)).map((m) => ({ id: m.id, out: m.direction === "out", body: m.body, at: m.at }))) : [];

  const qs = (over: Record<string, string>) => {
    const u = new URLSearchParams();
    const cur: Record<string, string> = { carpeta, estado: estado === "abiertos" ? "" : estado, hilo: selId, datos: onlyMissing ? "1" : "", ...over };
    for (const [k, v] of Object.entries(cur)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "?";
  };
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "https://tu-crm.vercel.app";
  const metaOk = metaConfigured();

  const datosLink: ReactNode = (
    <Link href={qs({ datos: onlyMissing ? "" : "1", hilo: "" })} className={`mb-2 flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium ${onlyMissing ? "border-[#d97706] bg-[#d97706] text-white" : "border-[#d97706]/40 bg-[#d97706]/10 text-[#b45309] hover:bg-[#d97706]/20"}`}>
      <span className="truncate">Faltan datos</span><span className={`rounded-full px-1.5 text-xs ${onlyMissing ? "bg-white/25" : "bg-[#d97706]/20"}`}>{missingCount}</span>
    </Link>
  );

  const folderLink = (k: string, label: string, strong = false): ReactNode => (
    <Link key={k} href={qs({ carpeta: k, hilo: "" })} className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${k === carpeta ? "bg-primary/10 font-medium text-primary" : "text-muted hover:bg-bg hover:text-ink"} ${strong ? "font-medium" : ""}`}>
      <span className="truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-xs ${k === carpeta ? "bg-primary/15" : "bg-bg"}`}>{folderCount(k)}</span>
    </Link>
  );

  return (
    <div className="space-y-4" style={{ "--color-primary": "#2563eb", "--color-primary-hover": "#1d4ed8" } as CSSProperties}>
      <PageHeader
        title="Mensajes" subtitle="Todas las consultas de tus clientes en un solo lugar"
        actions={<>
          <CreateDrawer
            buttonLabel="Avisos al celular" title="Avisos al celular del negocio" variant="secondary" action={saveAlerts} extraAction={{ label: "Guardar y mandar prueba", action: saveAndTestAlerts }}
            fields={[
              { name: "enabled", label: "Avisos", type: "select", noBlank: true, defaultValue: db.settings.company?.alerts?.enabled ? "si" : "no", options: [{ value: "si", label: "Activados" }, { value: "no", label: "Apagados" }] },
              { name: "topic", label: "Tema (la dirección secreta del celular)", defaultValue: db.settings.company?.alerts?.ntfyTopic ?? "", placeholder: "Se genera solo al guardar", help: "No lo compartas: quien lo tenga recibe los avisos." },
              { name: "como", label: "¿Querés saber cómo se conecta?", type: "guide", defaultValue: "1) En el celular del negocio instalá la app gratuita «ntfy» (Play Store o App Store).\n2) Abrila, tocá «+» y escribí el tema de arriba (guardá primero para que se genere).\n3) Tocá «Guardar y mandar prueba»: tiene que sonar el celular.\n\nSe avisa cuando entra una pregunta nueva o un mensaje de un comprador, y otra vez si pasa una hora sin responder. El aviso no lleva el texto ni el nombre del cliente." },
            ]}
          />
          {unreadTotal > 0 ? <ActionButton action={markAllRead.bind(null, mlUnreadKeys)} label={`Marcar ${unreadTotal} como leídos`} /> : null}
        </>}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[13.5rem_22rem_minmax(0,1fr)]">
        {/* Carpetas: cada plataforma con su color y sus tipos de mensaje */}
        {/* Celular: carpetas plegadas para que la lista de mensajes quede a la vista. */}
        <details className="rounded-lg border border-line bg-surface lg:hidden">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium">Carpetas de mensajes ▾</summary>
          <div className="p-2 pt-0">
          {datosLink}
          {folderLink("", "Todas", true)}
          {GROUPS.map((g) => (
            <div key={g.channel} className="mt-3">
              <p className="mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span className="h-3 w-1 rounded-full" style={{ background: CH[g.channel].color }} />{CH[g.channel].label}
              </p>
              {g.folders.map((f) => folderLink(f.key, f.label))}
            </div>
          ))}
          </div>
        </details>
        <aside className="hidden rounded-lg border border-line bg-surface p-2 lg:block">
          {datosLink}
          {folderLink("", "Todas", true)}
          {GROUPS.map((g) => (
            <div key={g.channel} className="mt-3">
              <p className="mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span className="h-3 w-1 rounded-full" style={{ background: CH[g.channel].color }} />{CH[g.channel].label}
              </p>
              {g.folders.map((f) => folderLink(f.key, f.label))}
            </div>
          ))}
        </aside>

        {/* Lista de conversaciones */}
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <nav className="flex gap-0.5 border-b border-line bg-bg p-1" aria-label="Filtrar por estado">
            {STATES.map(([k, label]) => (
              <Link key={k} href={qs({ estado: k === "abiertos" ? "" : k, hilo: "" })} className={`flex flex-1 flex-col items-center rounded px-1.5 py-1.5 leading-tight ${k === estado ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                <span className={`text-xs ${k === estado ? "font-medium" : ""}`}>{label}</span>
                <span className="mt-0.5 text-sm font-semibold tabular-nums">{stateCount(k)}</span>
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line px-3 py-1.5 text-[11px] text-muted">
            {Object.values(DOT).map((d) => <span key={d.label} className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />{d.label}</span>)}
          </div>
          {shown.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              <p className="font-medium text-ink">No hay conversaciones {estado === "resueltos" ? "resueltas" : estado === "sinleer" ? "sin leer" : estado === "antiguas" ? "antiguas sin responder" : "abiertas"} acá.</p>
              <p className="mt-1">Las preguntas y mensajes de Mercado Libre entran solos. Las notas y carritos de Tienda Nube, al sincronizar esa sección.</p>
            </div>
          ) : (
            <ul className="max-h-[68vh] divide-y divide-line overflow-y-auto">
              {shown.slice(0, 150).map((t) => (
                <li key={t.id}>
                  <Link href={qs({ hilo: t.id })} className={`block border-l-[3px] px-3 py-2.5 hover:bg-bg ${t.id === selId ? "bg-bg" : ""}`} style={{ borderLeftColor: CH[t.channel].color }}>
                    <div className="flex items-center justify-between gap-2">
                      <TypeTag t={t} />
                      <span className="shrink-0 text-[11px] text-muted" title={ago(t.at)}>{when(t.at)}</span>
                    </div>
                    <p className={`mt-1 flex items-center gap-1.5 text-sm ${t.unread && t.open ? "font-semibold" : "font-medium"}`}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotOf(t).color }} title={dotOf(t).label} aria-label={dotOf(t).label} /><span className="truncate">{t.name}</span>
                    </p>
                    {t.open && <p className="mt-1 text-[11px] font-semibold" style={{ color: waiting(t.at).color }}>Esperando respuesta hace {waiting(t.at).label}</p>}
                    {missingOf(t).length > 0 && <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#d97706]/15 px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">Falta el teléfono</p>}
                    {t.subject && <p className="truncate text-xs text-muted">{t.subject}</p>}
                    {saleOf(t) && <p className="truncate text-xs font-medium text-ink">Compró el {fdate(saleOf(t)!.date)}</p>}
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.preview}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Conversación */}
        <section className="min-h-48 overflow-hidden rounded-lg border border-line bg-surface">
          {!sel ? (
            <div className="p-10 text-center text-sm text-muted">Elegí una conversación de la lista para verla y responderla acá.</div>
          ) : (
            <div className="flex flex-col">
              <div className="h-1" style={{ background: CH[sel.channel].color }} />
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><TypeTag t={sel} /><span className="text-xs text-muted">{CH[sel.channel].label}</span>{!sel.open && <Badge tone="success">Resuelta</Badge>}</div>
                  <h2 className="mt-1.5 text-base font-semibold">{sel.name}</h2>
                  {sel.subject && <p className="text-sm text-muted">{sel.itemUrl ? <a href={sel.itemUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{sel.subject} ↗</a> : sel.subject}</p>}
                  {(sel.phone || sel.email || sel.handle) && <p className="mt-0.5 text-xs text-muted">{[sel.phone, sel.email, sel.handle].filter(Boolean).join(" · ")}</p>}
                  {sel.customerId && nameOfCustomer(sel.customerId) && <p className="mt-0.5 text-xs text-muted">Cliente del CRM: {nameOfCustomer(sel.customerId)}</p>}
                  {saleLine(sel) && <p className="mt-1 inline-block rounded-md bg-bg px-2 py-1 text-xs font-medium text-ink">{saleLine(sel)}</p>}
                  {(() => {
                    const c = customerOf(sel);
                    if (!c) return null;
                    const found = newDetected(extractFromMessages(selMessages.filter((m) => !m.out).map((m) => m.body)), c);
                    return <div className="mt-2"><DetectedData customer={c} found={found} /></div>;
                  })()}
                  {missingOf(sel).length > 0 && (() => {
                    const c = customerOf(sel)!;
                    const user = mlUserOf(c);
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-[#d97706]/10 px-2.5 py-1.5 text-xs text-[#b45309]">
                        <span className="font-semibold">Falta el teléfono</span>
                        <PasteData customerId={c.id} compact />
                        <CreateDrawer buttonLabel="Cargar datos" compact variant="secondary" title={`Datos de ${looksLikeUser(c) ? user : c.name}`} action={saveCustomerData.bind(null, c.id)}
                          fields={[
                            ...(user ? [{ name: "mlUser", label: "Usuario de Mercado Libre", defaultValue: user, readOnly: true }] : []),
                            { name: "name", label: "Nombre y apellido reales", defaultValue: looksLikeUser(c) ? "" : c.name },
                            { name: "phone", label: "Teléfono", defaultValue: c.phone },
                            { name: "email", label: "Email", type: "email" as const, defaultValue: c.email },
                            { name: "address", label: "Domicilio", defaultValue: c.address },
                            { name: "city", label: "Ciudad y provincia", defaultValue: c.city },
                          ]} />
                      </div>
                    );
                  })()}
                </div>
                {!sel.saved && sel.readKey && sel.open && (
                  <div className="flex flex-wrap gap-2">
                    {sel.unread && <ActionButton action={markMlRead.bind(null, sel.readKey)} label="Marcar como leído" />}
                    <ActionButton action={markMlRead.bind(null, doneKey(sel.readKey))} label="Resolver" />
                  </div>
                )}
                {sel.saved && (
                  <div className="flex flex-wrap gap-2">
                    {sel.unread && <ActionButton action={setThreadState.bind(null, sel.id, "leido")} label="Marcar como leído" />}
                    {sel.open ? <ActionButton action={setThreadState.bind(null, sel.id, "resuelto")} label="Resolver" /> : <ActionButton action={setThreadState.bind(null, sel.id, "abierto")} label="Reabrir" />}
                  </div>
                )}
              </header>

              <div className="space-y-3 bg-bg/50 p-4">
                {selMessages.length === 0 && <p className="text-sm text-muted">Sin mensajes guardados.</p>}
                {selMessages.map((m) => (
                  <div key={m.id} className={`flex ${m.out ? "justify-end" : ""}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.out ? "bg-primary/10" : "border border-line bg-surface"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-[11px] text-muted">{m.out ? "Vos" : sel.name} · {dt(m.at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <footer className="space-y-3 border-t border-line p-4">
                {sel.reply?.type === "question" && (
                  <ReplyForm action={answerQuestion.bind(null, sel.reply.id)} max={2000} label="Responder pregunta" placeholder="Escribí la respuesta que va a ver el comprador en la publicación…" hint="Se publica en Mercado Libre" quick={quickForQuestion(db.settings.company, db.settings.name, { nombre: looksLikeUser(customerOf(sel)) ? "" : (sel.name === "Comprador" ? "" : sel.name), productos: sel.subject })} />
                )}
                {sel.reply?.type === "buyer" && (
                  <ReplyForm action={replyToBuyer.bind(null, sel.reply.packId, sel.reply.buyerId)} max={350} label="Enviar mensaje" placeholder="Escribí tu mensaje al comprador…" hint="Se envía por la mensajería de Mercado Libre" quick={quickFor(db.settings.company, db.settings.name, { nombre: looksLikeUser(customerOf(sel) ) ? "" : (sel.name === "Comprador" ? "" : sel.name), productos: saleOf(sel) ? saleOf(sel)!.items.map((i) => db.products.find((p) => p.id === i.productId)?.name ?? "").filter(Boolean).join(", ") : "" })} />
                )}
                {sel.channel === "mercadolibre" && !sel.reply && <p className="text-sm text-muted">{sel.open ? "Esta conversación se contesta desde Mercado Libre." : "Conversación respondida."} <Link href={sel.link} className="text-primary hover:underline">Abrir en la sección Mercado Libre →</Link></p>}
                {sel.channel !== "mercadolibre" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <ContactButtons name={sel.name} phone={sel.phone} email={sel.email} />
                    {sel.channel === "instagram" && <a href={sel.link || "https://www.instagram.com/direct/inbox/"} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-bg">Abrir en Instagram ↗</a>}
                    {sel.kind === "carrito" && sel.link && <a href={sel.link} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-bg">Link del carrito ↗</a>}
                    {sel.kind === "nota" && <Link href="/ventas" className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-xs font-medium hover:bg-bg">Ver ventas</Link>}
                    <span className="text-xs text-muted">Estos canales los contestás vos desde cada uno.</span>
                  </div>
                )}
              </footer>
            </div>
          )}
        </section>
      </div>

      <details className="rounded-lg border border-line bg-surface p-4 text-sm">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-medium">
          Canales conectados
          <Badge tone="success">Mercado Libre</Badge><Badge tone="success">Tienda Nube</Badge>
          <Badge tone={metaOk ? "success" : "warning"}>{`WhatsApp ${metaOk ? "listo" : "sin conectar"}`}</Badge><Badge tone={metaOk ? "success" : "warning"}>{`Instagram ${metaOk ? "listo" : "sin conectar"}`}</Badge>
        </summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>Mercado Libre y Tienda Nube ya están activos. WhatsApp e Instagram están preparados: cuando Meta se pueda conectar, cada mensaje entra solo, sin tocar código.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>En <strong>developers.facebook.com</strong>, en tu app de Meta, agregá los productos WhatsApp y/o Instagram y activá el permiso de mensajes.</li>
            <li>En Vercel → Variables de entorno cargá <code>META_APP_SECRET</code> y <code>META_VERIFY_TOKEN</code> (una palabra clave que elijas). Opcional para Instagram: <code>INSTAGRAM_ACCESS_TOKEN</code>, para ver nombre y usuario.</li>
            <li>En los webhooks de Meta pegá estas direcciones con el mismo <code>META_VERIFY_TOKEN</code> y suscribite a “messages”:
              <ul className="mt-1 space-y-0.5 pl-1"><li>WhatsApp: <code className="break-all">{base}/api/messaging/whatsapp</code></li><li>Instagram: <code className="break-all">{base}/api/messaging/instagram</code></li></ul>
            </li>
          </ol>
          <Guide title="¿Cómo respondo en cada canal?">En WhatsApp, Instagram y Tienda Nube las respuestas las enviás vos: el botón abre el chat o el correo con el contacto listo. Las de Mercado Libre se contestan acá mismo.</Guide>
        </div>
      </details>
    </div>
  );
}
