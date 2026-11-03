import Link from "next/link";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, PageHeader, param, type SearchParams } from "@/components/shared/list";
import { DataTable } from "@/components/ui/DataTable";
import { Guide } from "@/components/ui/Guide";
import { Badge, KpiCard } from "@/components/ui/primitives";
import { waAccountStatus } from "@/integrations/whatsapp/account";
import { approveDemoTemplate, connectWhatsApp, deleteWaTemplate, disconnectWhatsApp, refreshWaTemplates, saveWaAutomations, saveWaTemplate } from "@/integrations/whatsapp/actions";
import { metaConfigured } from "@/lib/meta-webhook";
import { getDb } from "@/modules/data";
import { demoLog } from "@/modules/demo/whatsapp";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import { stagesOf } from "@/modules/shipments";
import { WA_VARS, type WaTemplate } from "@/modules/whatsapp";

const TABS = [["conexion", "Conexión"], ["plantillas", "Plantillas"], ["avisos", "Avisos automáticos"], ["registro", "Registro"]] as const;
const STATUS: Record<WaTemplate["status"], { label: string; tone: "success" | "warning" | "danger" }> = { APPROVED: { label: "Aprobada", tone: "success" }, PENDING: { label: "En revisión", tone: "warning" }, REJECTED: { label: "Rechazada", tone: "danger" } };
/** Muestra el texto de la plantilla con las variables por su nombre ([nombre]) en vez de {{1}}. */
const readable = (t: Pick<WaTemplate, "body" | "vars">) => t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[${t.vars[Number(n) - 1] ?? n}]`);

async function remove(id: string) { "use server"; await deleteWaTemplate(id); }
async function approve(id: string) { "use server"; await approveDemoTemplate(id); }
async function refresh() { "use server"; await refreshWaTemplates(); }
async function disconnect() { "use server"; await disconnectWhatsApp(); }
async function saveAuto(fd: FormData) { "use server"; await saveWaAutomations(fd); }

type LogRow = { id: string; at: string; to: string; template: string; body: string; status: string; reason: string };

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t[0] === param(sp, "tab"))?.[0] ?? "conexion";
  const db = await getDb();
  const supa = isSupabase();
  const demo = !supa && Boolean(db.isDemo);
  const projectId = supa ? await activeProjectId() : "";
  const cfg = db.settings.company?.whatsappApi ?? {};
  const templates = cfg.templates ?? [];
  const approved = templates.filter((t) => t.status === "APPROVED");
  const account = supa ? await waAccountStatus(projectId).catch(() => ({ connected: false } as Awaited<ReturnType<typeof waAccountStatus>>)) : { connected: demo, display: demo ? "+54 9 11 5555-0000" : undefined, since: undefined, status: undefined, error: undefined };
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "https://tu-crm.vercel.app";
  const stages = stagesOf(db.settings);
  const autos = cfg.automations ?? [];

  let log: LogRow[] = [];
  if (tab === "registro") {
    if (supa) {
      const { data } = await service().from("whatsapp_outbox").select("id,created_at,to_phone,template_name,body,status,error").eq("project_id", projectId).order("created_at", { ascending: false }).limit(60);
      log = (data ?? []).map((r) => ({ id: r.id, at: r.created_at, to: `+${r.to_phone}`, template: r.template_name ?? "Respuesta", body: r.body ?? "", status: r.status, reason: r.error ?? "" }));
    } else {
      log = demoLog().map((r) => ({ id: r.id, at: r.at, to: r.to, template: r.template, body: r.body, status: r.status, reason: r.reason ?? "" }));
    }
  }
  const when = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="space-y-5">
      <PageHeader
        title="WhatsApp" subtitle="Conectá tu número, creá tus plantillas y activá avisos automáticos para tus clientes"
        actions={tab === "plantillas" ? (
          <>
            {supa && <ActionButton action={refresh} label="Actualizar estados" />}
            <CreateDrawer
              buttonLabel="Nueva plantilla" title="Nueva plantilla de WhatsApp" action={saveWaTemplate}
              fields={[
                { name: "name", label: "Nombre", required: true, placeholder: "pedido_en_viaje", help: "Solo letras minúsculas, números y guion bajo. Meta no deja cambiarlo después." },
                { name: "category", label: "Tipo", type: "select", noBlank: true, defaultValue: "UTILITY", options: [{ value: "UTILITY", label: "Utilidad: avisos de pedidos, envíos y turnos" }, { value: "MARKETING", label: "Marketing: promociones y novedades (cuesta más)" }] },
                { name: "body", label: "Texto", type: "textarea", required: true, rows: 6, maxLength: 1024, placeholder: "Hola [nombre]! Tu pedido de [producto] ya salió. Seguilo acá: [seguimiento]", help: `Usá [nombre], [producto], [seguimiento], [negocio] o [etapa] para los datos que cambian. No puede empezar ni terminar con una variable.` },
                { name: "como", label: "¿Cómo se aprueba?", type: "guide", defaultValue: "En la versión real, Meta revisa cada plantilla antes de que se pueda usar y puede tardar de minutos a un día. Si la rechaza, te dice el motivo y la podés corregir y mandar de nuevo.\n\nMeta decide si es de utilidad o de marketing según lo que dice el texto: si suena a promoción, la cuenta como marketing y cuesta más." },
              ]}
            />
          </>
        ) : undefined}
      />

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Secciones de WhatsApp">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${k === tab ? "border-primary bg-primary text-white shadow-soft" : "border-line bg-surface text-muted hover:bg-mint hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>

      {tab === "conexion" && (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Estado" value={account.connected ? "Conectado" : "Sin conectar"} hint={demo ? "Número de ejemplo de la demostración" : account.display ? `Número ${account.display}` : "Conectá tu número para empezar"} />
            <KpiCard label="Plantillas aprobadas" value={String(approved.length)} hint={`${templates.length} en total`} />
            <KpiCard label="Avisos activos" value={String(autos.filter((a) => a.enabled).length)} hint="Etapas de envío con aviso automático" />
          </section>

          <div className="lift rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />Tu número de WhatsApp</h3>
                <p className="mt-1 text-sm text-muted">{account.connected ? (demo ? "En la demostración el número es de ejemplo: nada se envía a ningún lado." : `Conectado con la API oficial de Meta${account.display ? ` (${account.display})` : ""}. Los mensajes entran a Mensajes y los contestás desde ahí.`) : "Todavía no hay un número conectado. Con la API oficial de Meta contestás y mandás avisos sin salir del sistema."}</p>
                {account.error && <p className="mt-1 text-sm text-danger">{account.error}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={account.connected ? "success" : "warning"}>{account.connected ? (demo ? "Conectado (demo)" : "Conectado") : "Sin conectar"}</Badge>
                {supa && account.connected && <ConfirmActionButton action={disconnect} label="Desconectar" message="¿Desconectar WhatsApp? Los mensajes dejan de entrar y de salir hasta que lo vuelvas a conectar." />}
                {supa && !account.connected && (
                  <CreateDrawer
                    buttonLabel="Conectar mi número" title="Conectar WhatsApp" action={connectWhatsApp}
                    fields={[
                      { name: "phoneNumberId", label: "Identificador del número", required: true, placeholder: "109876543210987", help: "En Meta → WhatsApp → Configuración de la API." },
                      { name: "wabaId", label: "Identificador de la cuenta de WhatsApp Business", required: true, placeholder: "123456789012345" },
                      { name: "token", label: "Token de acceso permanente", type: "textarea", required: true, rows: 4, help: "Se guarda cifrado. Nunca lo compartas." },
                      { name: "como", label: "¿De dónde saco estos datos?", type: "guide", defaultValue: "1) En developers.facebook.com abrí tu app de Meta y agregá el producto WhatsApp.\n2) En «Configuración de la API» copiá el identificador del número y el de la cuenta de WhatsApp Business.\n3) Creá un usuario del sistema en Meta Business y generá un token permanente con los permisos de mensajes y administración de WhatsApp.\n4) Pegá los tres datos acá: se comprueban con Meta antes de guardar." },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h3 className="flex items-center gap-2 text-base font-semibold"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />Cuánto cuesta</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><strong className="text-ink">Contestar a quien te escribió:</strong> gratis, dentro de las 24 horas de su último mensaje.</li>
                <li><strong className="text-ink">Avisos con plantilla de utilidad</strong> (pedido enviado, entregado): los cobra Meta a tu cuenta de WhatsApp, un valor bajo por mensaje.</li>
                <li><strong className="text-ink">Plantillas de marketing</strong> (promociones): cuestan varias veces más que las de utilidad.</li>
                <li>Las tarifas de Argentina las ves en el panel de Meta. Carritix no agrega ningún recargo.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h3 className="flex items-center gap-2 text-base font-semibold"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />Recibir mensajes</h3>
              <p className="mt-3 text-sm text-muted">{metaConfigured() || demo ? "El aviso de Meta ya está configurado." : "Falta configurar el aviso de Meta (webhook)."} En tu app de Meta, el webhook de WhatsApp apunta a esta dirección con la suscripción «messages»:</p>
              <p className="mt-2 break-all rounded-2xl bg-bg px-4 py-2.5 font-mono text-xs text-ink">{base}/api/messaging/whatsapp</p>
              <p className="mt-2 text-xs text-muted">Quien te escribe acepta recibir tus respuestas y avisos. Si escribe «BAJA», no se le manda más nada.</p>
            </div>
          </div>
        </div>
      )}

      {tab === "plantillas" && (
        <div className="space-y-4">
          <Guide title="¿Para qué sirven las plantillas?">
            Pasadas las 24 horas del último mensaje de un cliente, WhatsApp solo deja escribirle con una <strong>plantilla</strong> aprobada por Meta. También las usan los avisos automáticos de envío. Cada negocio crea las suyas, con su propio estilo.
          </Guide>
          <DataTable
            rows={templates} rowKey={(t) => t.id} emptyTitle="Todavía no creaste plantillas" emptyDescription="Creá la primera con «Nueva plantilla»: por ejemplo, el aviso de que el pedido ya salió."
            columns={[
              { key: "n", header: "Nombre", render: (t) => <div><p className="font-medium">{t.name}</p><p className="text-[11px] text-muted">{t.language}</p></div> },
              { key: "c", header: "Tipo", render: (t) => <Badge tone={t.category === "UTILITY" ? "info" : "warning"}>{t.category === "UTILITY" ? "Utilidad" : "Marketing"}</Badge> },
              { key: "s", header: "Estado", render: (t) => <div><Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>{t.reason && <p className="mt-1 text-[11px] text-danger">{t.reason}</p>}</div> },
              { key: "b", header: "Texto", render: (t) => <p className="max-w-md whitespace-pre-wrap text-xs text-muted">{readable(t)}</p> },
              {
                key: "a", header: "", align: "right",
                render: (t) => (
                  <div className="flex items-center justify-end gap-1.5">
                    {demo && t.status === "PENDING" && <ActionButton action={approve.bind(null, t.id)} label="Simular aprobación" />}
                    <ConfirmActionButton action={remove.bind(null, t.id)} label="Eliminar plantilla" message={`¿Eliminar la plantilla ${t.name}? Los avisos que la usan se desactivan.`} icon medium />
                  </div>
                ),
              },
            ]}
          />
          {demo && <p className="text-xs text-muted">En la demostración podés simular que Meta aprobó una plantilla. En la versión real el estado lo informa Meta.</p>}
        </div>
      )}

      {tab === "avisos" && (
        <form action={saveAuto} className="space-y-3">
          <Guide title="¿Cómo funcionan los avisos automáticos?">
            Cuando movés un envío a una etapa con aviso activo, el cliente recibe por WhatsApp la plantilla que elijas, con sus datos (nombre, producto, seguimiento). Solo sale si la plantilla está aprobada, el envío tiene teléfono y el cliente aceptó recibir mensajes. Cada aviso sale una sola vez.
          </Guide>
          <div className="space-y-2.5">
            {stages.map((s) => {
              const a = autos.find((x) => x.stage === s.id);
              return (
                <div key={s.id} className="lift flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-card">
                  <span className="flex min-w-40 items-center gap-2 font-medium"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                  <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name={`on_${s.id}`} defaultChecked={a?.enabled ?? false} className="h-4 w-4" />Avisar</label>
                  <select name={`tpl_${s.id}`} defaultValue={a?.templateId ?? ""} className="min-w-56 flex-1 rounded-full border border-line bg-surface px-4 py-2 text-sm" aria-label={`Plantilla para ${s.name}`}>
                    <option value="">Sin plantilla</option>
                    {approved.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Variables disponibles: {WA_VARS.map((v) => `[${v.key}]`).join(" · ")}</p>
            <button type="submit" className="inline-flex items-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-ink shadow-green transition hover:-translate-y-px hover:bg-[#3fd496]">Guardar avisos</button>
          </div>
        </form>
      )}

      {tab === "registro" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Todo lo que el sistema mandó (o dejó de mandar y por qué). {demo ? "Para probarlo, movés un envío a «En viaje» o «Entregado» desde Envíos y volvés acá." : ""}</p>
          <DataTable
            rows={log} rowKey={(r) => r.id} emptyTitle="Todavía no se mandó ningún aviso" emptyDescription="Cuando un envío cambie a una etapa con aviso activo, aparece acá."
            columns={[
              { key: "d", header: "Fecha", render: (r) => <span className="whitespace-nowrap text-xs">{when(r.at)}</span> },
              { key: "t", header: "Para", render: (r) => <span className="whitespace-nowrap text-xs">{r.to}</span> },
              { key: "p", header: "Plantilla", render: (r) => <span className="text-xs font-medium">{r.template}</span> },
              { key: "e", header: "Estado", render: (r) => <Badge tone={r.status === "omitido" || r.status === "failed" ? "warning" : "success"}>{r.status === "omitido" ? "No se envió" : r.status === "failed" ? "Falló" : "Enviado"}</Badge> },
              { key: "m", header: "Mensaje o motivo", render: (r) => <p className="max-w-md whitespace-pre-wrap text-xs text-muted">{r.reason || r.body}</p> },
            ]}
          />
        </div>
      )}
    </div>
  );
}
