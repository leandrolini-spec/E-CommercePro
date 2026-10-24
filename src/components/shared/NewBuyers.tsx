import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { Collapsible } from "@/components/shared/Collapsible";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { IconPencil } from "@/components/shared/icons";
import Link from "next/link";
import { Guide } from "@/components/ui/Guide";
import { Badge } from "@/components/ui/primitives";
import { hrefWith } from "@/components/shared/period";
import { param, type SearchParams } from "@/components/shared/list";
import { fdate, money, today } from "@/lib/format";
import { gmailLink, waLink } from "@/lib/contact";
import { replyToBuyer, setWelcomeAuto, welcomeBuyer } from "@/integrations/mercadolibre/actions";
import { quickFor } from "@/modules/quick-replies";
import { welcomeParts, welcomeText, welcomeTnText } from "@/modules/welcome";
import { DetectedData, newDetected } from "@/components/shared/DetectedData";
import { PasteData } from "@/components/shared/PasteData";
import { extractFromMessages } from "@/modules/extract";
import { hideWaiting, markWelcomed, saveCustomerData, unmarkWelcomed } from "@/modules/actions";
import { saleTotals } from "@/modules/calc";
import { inAgenda, isWelcomed, looksLikeUser, mlUserOf } from "@/modules/customers";
import type { Db } from "@/modules/types";


const chatIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3A1.5 1.5 0 0 1 3 11.5v-7Z" /></svg>;
const mailIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M2.5 5.4A2 2 0 0 1 4.5 3.5h11a2 2 0 0 1 2 1.9L10 10.2 2.5 5.4Zm0 1.9v7.3a2 2 0 0 0 2 1.9h11a2 2 0 0 0 2-1.9V7.3l-7 4.5a1 1 0 0 1-1 0l-7-4.5Z" /></svg>;
const waIcon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M10 2a8 8 0 0 0-6.9 12l-1 3.6a.6.6 0 0 0 .7.8l3.7-1A8 8 0 1 0 10 2Zm4.2 11.3c-.2.5-1.1 1-1.5 1-.4.1-.9.1-2.4-.5-2-.9-3.3-2.9-3.4-3-.1-.1-.8-1.1-.8-2s.5-1.4.7-1.6c.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .4.3l.6 1.5c.1.1.1.3 0 .4l-.3.4-.3.3c-.1.1-.2.3-.1.4.5.9 1.2 1.6 2.1 2.1.2.1.3.1.4 0l.5-.6c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.3 0 .2 0 .7-.2 1.1Z" /></svg>;

const BTN = "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold transition";

/** Una tarjeta por compra, como la venta de Mercado Libre: quién compró, qué, cuánto y el botón para enviarle la bienvenida. */
type ConvMsg = { id: string; orderId: string; text: string; date: string; fromBuyer: boolean };

export function NewBuyersTab({ db, channel, sp, messages = [] }: { db: Db; channel: "Mercado Libre" | "Tienda Nube" | "WhatsApp" | "Meta"; sp: SearchParams; messages?: ConvMsg[] }) {
  const isMl = channel === "Mercado Libre";
  const waiting = param(sp, "v") === "esperando";
  // "Meta" junta lo que viene de Instagram y de las campañas de Meta.
  const inChannel = (c: string) => (channel === "Meta" ? ["Instagram", "Campaña Meta", "Meta"].includes(c) : c === channel);
  const ofChannel = db.sales.filter((s) => inChannel(s.channel) && s.status !== "cancelada");
  const dataOf = (id: string) => db.customers.find((x) => x.id === id);
  // La tarjeta se queda acá, aunque ya se le haya mandado la bienvenida (a mano o sola), hasta que se la saque con el tilde o el tacho.
  const pending = ofChannel.filter((s) => !isWelcomed(s));
  // Ya se les escribió (o se sacaron de la lista) pero siguen sin teléfono: no se pierden de vista.
  const esperando = ofChannel.filter((s) => isWelcomed(s) && !s.waitingHidden && !!(s.welcomedAt ?? s.welcomeSentAt) && !inAgenda(dataOf(s.customerId) ?? {}));
  const sales = (waiting ? esperando : pending).sort((a, b) => (waiting ? (b.welcomedAt ?? b.welcomeSentAt ?? "").localeCompare(a.welcomedAt ?? a.welcomeSentAt ?? "") : 0) || b.date.localeCompare(a.date) || b.number - a.number).slice(0, 60);
  const prodsText = (s: { items: { productId: string }[] }) => s.items.map((i) => db.products.find((p) => p.id === i.productId)?.name ?? "").filter(Boolean).join(", ");
  const convFor = (orderId?: string) => messages.filter((m) => m.orderId === String(orderId)).sort((a, b) => a.date.localeCompare(b.date));
  const dt = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  const daysSince = (iso?: string) => (iso ? Math.max(0, Math.round((new Date(`${today()}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000)) : 0);

  return (
    <div className="space-y-4">
      <nav className="grid max-w-3xl grid-cols-2 gap-1.5" aria-label="Lista">
        {([["", `Por contactar (${pending.length})`], ["esperando", `Esperando datos (${esperando.length})`]] as const).map(([k, label]) => (
          <Link key={k} href={hrefWith(sp, { v: k })} className={`inline-flex h-10 w-full items-center justify-center rounded-full border px-3 text-sm ${(k === "esperando") === waiting ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      {isMl && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${db.settings.company?.welcomeAuto ? "border-success/40 bg-success/10" : "border-line bg-surface"}`}>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">Bienvenida automática: {db.settings.company?.welcomeAuto ? "ACTIVADA" : "apagada"}</p>
            <p className="text-xs text-muted">{db.settings.company?.welcomeAuto ? "Cada compra nueva de productos recibe sola el mensaje de bienvenida por Mercado Libre y pasa a “Esperando datos”." : "Si la activás, cada compra nueva de productos recibe sola el mensaje de bienvenida, sin que toques nada."} Solo productos; las demás compras siguen manuales.</p>
          </div>
          <form action={setWelcomeAuto.bind(null, !db.settings.company?.welcomeAuto)}>
            <button type="submit" className={`inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold ${db.settings.company?.welcomeAuto ? "border border-line bg-surface text-ink hover:bg-bg" : "bg-primary text-white"}`}>{db.settings.company?.welcomeAuto ? "Apagar" : "Activar"}</button>
          </form>
        </div>
      )}
      <Guide title="¿Querés saber cómo funciona esta lista?">
        Acá quedan las compras nuevas hasta que vos decidas sacarlas con el <strong>tilde</strong> o el <strong>tacho</strong>, aunque la bienvenida ya se haya enviado (a mano o sola). La charla sigue en <strong>Mensajes</strong>. Cargá sus datos con el lápiz: apenas tienen <strong>teléfono</strong> pasan solos a Clientes → Agenda; mientras tanto quedan en la solapa Todos.
        {isMl && " Mercado Libre puede rechazar mensajes que pidan datos de contacto."}
      </Guide>
      {sales.length === 0 && <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">{waiting ? "Nadie esperando datos: todos los compradores ya tienen teléfono." : "Sin compradores en la lista. Las compras nuevas aparecen solas."}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {sales.map((s) => {
          const c = db.customers.find((x) => x.id === s.customerId);
          if (!c) return null;
          const user = mlUserOf(c);
          const realName = looksLikeUser(c) ? "" : c.name;
          const shown = realName || user || "Comprador";
          const first = realName.split(" ")[0] ?? "";
          // Mercado Libre no entrega datos de contacto (se pide el teléfono); Tienda Nube sí, así que el mensaje es otro.
          const text = isMl ? welcomeText(db.settings.company) : welcomeTnText({ first, empresa: db.settings.name, instagram: db.settings.company?.instagram, web: db.settings.company?.website });
          const wa = c.phone ? waLink(c.phone, text) : null;
          const mail = c.email && /.+@.+\..+/.test(c.email) ? gmailLink(c.email, `Gracias por tu compra en ${db.settings.name}`, text) : null;
          const buyerId = c.id.replace(/^mlb_/, "");
          const missing = [!realName && "nombre", !c.address?.trim() && "domicilio", !c.phone?.trim() && "teléfono"].filter(Boolean) as string[];
          return (
            <article key={s.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <header className={`px-5 py-3 text-white ${waiting ? "bg-[#d97706]" : "bg-[#4aa35c]"}`}>
                <p className="text-xs">Venta {s.mlOrderId ? `#${s.mlOrderId}` : `#${s.number}`} · {fdate(s.date)}</p>
                <p className="text-lg font-bold">{waiting ? `Esperando datos · bienvenida hace ${daysSince(s.welcomeSentAt ?? s.welcomedAt)} d` : s.welcomeSentAt ? `Bienvenida enviada hace ${daysSince(s.welcomeSentAt)} d` : isMl ? "Pedile el teléfono y coordiná la entrega" : "Mandale la bienvenida y avisale de la entrega"}</p>
              </header>
              <div className="space-y-3 p-5">
                <div>
                  {s.items.map((i, k) => (
                    <p key={k} className="text-sm"><span className="font-medium">{db.products.find((p) => p.id === i.productId)?.name ?? "Producto"}</span> <span className="text-muted">· {money(i.unitPrice)} · Cantidad: {i.qty}u.</span></p>
                  ))}
                </div>
                <p className="text-sm">Te compró <strong>{shown}</strong>{user && realName ? ` | ${user}` : ""} <span className="text-muted">· {money(saleTotals(db, s).revenue)}</span></p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    if (!isMl) return null;
                    const conv = messages.filter((m) => m.orderId === String(s.mlOrderId)).sort((a, b) => a.date.localeCompare(b.date));
                    const confirmed = conv.some((m) => !m.fromBuyer && /Gracias por tu compra en nuestra tienda/i.test(m.text));
                    return s.welcomeSentAt ? (
                      <Badge tone={confirmed ? "success" : "info"}>✓ Bienvenida {s.welcomeBy === "auto" ? "automática" : "enviada"} el {fdate(s.welcomeSentAt)}{confirmed ? " · confirmada en Mercado Libre" : " · esperando confirmación (tocá Sincronizar ahora)"}</Badge>
                    ) : (
                      <Badge tone="warning">Bienvenida NO enviada{db.settings.company?.welcomeAuto ? " · se manda sola en la próxima sincronización (si es de productos)" : ""}</Badge>
                    );
                  })()}
                  {inAgenda(c) ? <Badge tone="success">En Agenda</Badge> : <Badge>En Todos · falta {missing.join(", ")}</Badge>}
                </div>
                {isMl && (() => {
                  // Lo que el comprador contestó (sus mensajes después de la bienvenida): si trae teléfono o dirección, se ofrece cargarlo.
                  const found = newDetected(extractFromMessages(messages.filter((m) => m.orderId === String(s.mlOrderId) && m.fromBuyer).sort((a, b) => a.date.localeCompare(b.date)).map((m) => m.text)), c);
                  return <DetectedData customer={c} found={found} />;
                })()}
                {isMl && (() => {
                  const conv = messages.filter((m) => m.orderId === String(s.mlOrderId)).sort((a, b) => a.date.localeCompare(b.date));
                  return (
                    <Collapsible title={`Ver conversación (${conv.length} mensaje${conv.length === 1 ? "" : "s"})`}>
                      <div className="space-y-2 p-3 pt-1">
                        {conv.length === 0 && <p className="text-muted">Todavía no hay mensajes guardados de esta compra.</p>}
                        {conv.map((m) => (
                          <div key={m.id} className={`flex ${m.fromBuyer ? "" : "justify-end"}`}>
                            <div className={`max-w-[88%] rounded-lg px-2.5 py-1.5 ${m.fromBuyer ? "border border-line bg-surface" : "bg-primary/10"}`}>
                              <p className="whitespace-pre-wrap break-words">{m.text || "(vacío o adjunto)"}</p>
                              <p className="mt-0.5 text-[10px] text-muted">{m.fromBuyer ? shown : "Vos"} · {new Date(m.date).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Collapsible>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isMl && s.mlOrderId ? (() => {
                    // La bienvenida se manda una sola vez: si ya salió (figura en la conversación o está marcada), el cuadro queda en blanco para el mensaje siguiente.
                    const done = !!s.welcomeSentAt || convFor(s.mlOrderId).some((m) => !m.fromBuyer && /Gracias por tu compra en nuestra tienda/i.test(m.text));
                    return (
                    <CreateDrawer buttonLabel="Enviar mensaje" icon={chatIcon} title={done ? `Mensaje para ${shown}` : `Bienvenida para ${shown}`} action={done ? replyToBuyer.bind(null, s.mlOrderId, buyerId) : welcomeBuyer.bind(null, s.id, s.mlOrderId, buyerId)}
                      fields={[
                      ...(convFor(s.mlOrderId).length ? [{ name: "conversacion", label: "Conversación hasta ahora", type: "textarea" as const, readOnly: true, rows: 10, defaultValue: convFor(s.mlOrderId).map((m) => `${m.fromBuyer ? shown : "Vos"} · ${dt(m.date)}\n${m.text || "(vacío o adjunto)"}`).join("\n\n") }] : []),
                      done
                        ? { name: "text", label: "Tu mensaje por Mercado Libre (máximo 350 caracteres)", type: "textarea" as const, required: true, maxLength: 350, defaultValue: "", placeholder: "Escribí tu mensaje al comprador…", quick: quickFor(db.settings.company, db.settings.name, { nombre: realName, productos: prodsText(s) }) }
                        : { name: "bienvenida", label: "Se envían 3 mensajes seguidos por Mercado Libre", type: "textarea" as const, readOnly: true, rows: 16, defaultValue: welcomeParts(db.settings.company).map((m, k) => `Mensaje ${k + 1}\n${m}`).join("\n\n— — —\n\n"), help: "Pedido de datos, envíos en CABA y GBA, y envíos al interior." },
                    ]} />
                    );
                  })() : (
                    <>
                      {mail && <a href={mail} target="_blank" rel="noreferrer" className={`${BTN} gap-2 bg-primary text-white`}>{mailIcon}Enviar correo</a>}
                      {wa && <a href={wa} target="_blank" rel="noreferrer" className={`${BTN} gap-2 border border-[#16a34a]/40 bg-[#16a34a]/10 text-[#15803d]`}>{waIcon}WhatsApp</a>}
                      {!mail && !wa && <span title="Falta email y teléfono: cargalos con el lápiz" className={`${BTN} cursor-not-allowed gap-2 border border-line bg-bg text-muted/70`}>{chatIcon}Enviar mensaje</span>}
                    </>
                  )}
                  {waiting ? (
                    <form action={unmarkWelcomed.bind(null, s.id)}>
                      <button type="submit" title="Volver a Por contactar" aria-label="Volver a Por contactar" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-bg">
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="M4 10a6 6 0 1 0 2-4.5M4 4v3.5h3.5" /></svg>
                      </button>
                    </form>
                  ) : (
                  <form action={markWelcomed.bind(null, s.id)}>
                    <button type="submit" title="Ya lo contacté por otro medio: sacarlo de esta lista" aria-label="Ya lo contacté" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-bg">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
                    </button>
                  </form>
                  )}
                  <PasteData customerId={c.id} />
                  <CreateDrawer buttonLabel="Editar" iconOnly icon={<IconPencil />} variant="secondary" title={`Datos de ${shown}`} action={saveCustomerData.bind(null, c.id)}
                    fields={[
                      ...(user ? [{ name: "mlUser", label: "Usuario de Mercado Libre", defaultValue: user, readOnly: true }] : []),
                      { name: "name", label: "Nombre y apellido reales", defaultValue: realName },
                      { name: "phone", label: "Teléfono", defaultValue: c.phone },
                      { name: "email", label: "Email", type: "email" as const, defaultValue: c.email },
                      { name: "address", label: "Domicilio", defaultValue: c.address },
                      { name: "city", label: "Ciudad y provincia", defaultValue: c.city },
                    ]} />
                  {waiting
                    ? <ConfirmActionButton action={hideWaiting.bind(null, s.id)} label="Sacar de Esperando datos" message="¿Sacar esta compra de Esperando datos? La venta y el contacto no se borran: solo deja de figurar en esta lista." icon medium />
                    : <ConfirmActionButton action={markWelcomed.bind(null, s.id)} label="Quitar de la lista" message="¿Quitar esta compra de Nuevos compradores? La venta y el contacto no se borran: solo deja de aparecer acá." icon medium />}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
