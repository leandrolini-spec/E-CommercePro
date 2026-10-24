/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";
import { ColorField } from "@/components/shared/ColorField";
import { FontPicker } from "@/components/shared/FontPicker";
import { brandFonts } from "@/lib/fonts";
import { metaConfigured } from "@/lib/meta-webhook";
import { brandColor, brandSoft, softBorder } from "@/lib/brand";
import { CreateDrawer } from "@/components/shared/CreateDrawer";
import { ActionButton, PageHeader, param, type SearchParams } from "@/components/shared/list";
import { Alert, Badge, Input, Select } from "@/components/ui/primitives";
import { MODULES } from "@/core/modules";
import { SENDER_EMAIL } from "@/lib/contact";
import { money } from "@/lib/format";
import { loadDemoData, restoreImportedData, updateList } from "@/modules/actions";
import { dataSource, getDb } from "@/modules/data";
import { saveBrand, saveCompany, saveDelivery, saveQuickReplies, saveSystem, setIntegration } from "@/modules/settings-actions";
import { quickRepliesOf, quickToLines } from "@/modules/quick-replies";
import { deliveryRules } from "@/modules/delivery";
import { activeProjectId, isSupabase, service } from "@/modules/repo/supabase";
import { Guide } from "@/components/ui/Guide";

const TABS = [["empresa", "Empresa"], ["marca", "Marca y logo"], ["sistema", "Sistema"], ["integraciones", "Integraciones"]] as const;
const TAX_CONDITIONS = ["Monotributista", "Responsable inscripto", "Exento", "Consumidor final", "Sociedad / otra"];

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const SaveButton = ({ label = "Guardar cambios" }: { label?: string }) => (
  <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90">{label}</button>
);

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t[0] === param(sp, "tab"))?.[0] ?? "empresa";
  const db = await getDb();
  const s = db.settings;
  const c = s.company ?? {}, b = s.brand ?? {};
  const delivery = deliveryRules(c);
  const color = brandColor(b), soft = brandSoft(b), line = softBorder(soft);

  return (
    <div className="space-y-4">
      <PageHeader title="Configuración" subtitle="Los datos de tu empresa, el funcionamiento del sistema y tu marca" />

      <nav className="flex flex-wrap gap-1.5" aria-label="Secciones">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${k === tab ? "bg-primary text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>
      {param(sp, "ok") && <Alert tone="success" title="Cambios guardados." />}

      {tab === "empresa" && (
        <form action={saveCompany} className="space-y-4">
          <Card title="Identidad" subtitle="Cómo se llama tu negocio y cómo figura en los documentos.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre comercial" hint="El que ven tus clientes (aparece en el menú y en los presupuestos)."><Input name="name" required defaultValue={s.name} /></Field>
              <Field label="Razón social" hint="Si es distinta del nombre comercial."><Input name="legalName" defaultValue={c.legalName} /></Field>
              <Field label="CUIT"><Input name="cuit" defaultValue={c.cuit} placeholder="20-12345678-9" inputMode="numeric" /></Field>
              <Field label="Condición frente al IVA">
                <Select name="taxCondition" defaultValue={c.taxCondition ?? ""}>
                  <option value="">Sin indicar</option>
                  {TAX_CONDITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>
          </Card>
          <Card title="Titular del CUIT" subtitle="La persona a cuyo nombre está el CUIT. Se muestra en el informe del contador.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre y apellido" wide><Input name="holderName" defaultValue={c.holderName} /></Field>
              <Field label="DNI / CUIL"><Input name="holderDoc" defaultValue={c.holderDoc} inputMode="numeric" /></Field>
              <Field label="Domicilio fiscal"><Input name="holderAddress" defaultValue={c.holderAddress} /></Field>
              <Field label="Teléfono"><Input name="holderPhone" defaultValue={c.holderPhone} inputMode="tel" /></Field>
              <Field label="Correo electrónico"><Input name="holderEmail" type="email" defaultValue={c.holderEmail} /></Field>
            </div>
          </Card>
          <Card title="Domicilio" subtitle="Dirección comercial o de despacho.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dirección" wide><Input name="address" defaultValue={c.address} /></Field>
              <Field label="Ciudad"><Input name="city" defaultValue={c.city} /></Field>
              <Field label="Provincia"><Input name="province" defaultValue={c.province} /></Field>
              <Field label="Código postal"><Input name="zip" defaultValue={c.zip} /></Field>
            </div>
          </Card>
          <Card title="Contacto" subtitle="Cómo te encuentran tus clientes. Se muestra en los presupuestos.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono"><Input name="phone" defaultValue={c.phone} inputMode="tel" /></Field>
              <Field label="WhatsApp"><Input name="whatsapp" defaultValue={c.whatsapp} inputMode="tel" /></Field>
              <Field label="Correo electrónico"><Input name="email" type="email" defaultValue={c.email} /></Field>
              <Field label="Sitio web"><Input name="website" defaultValue={c.website} placeholder="https://" /></Field>
              <Field label="Instagram"><Input name="instagram" defaultValue={c.instagram} placeholder="@tunegocio" /></Field>
            </div>
          </Card>
          <Card title="Contador/a" subtitle="A quién se le manda el informe mensual de ventas y gastos (se arma desde Reportes).">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" wide><Input name="accountantName" defaultValue={c.accountantName} placeholder="Nombre y apellido" /></Field>
              <Field label="WhatsApp"><Input name="accountantPhone" defaultValue={c.accountantPhone} inputMode="tel" placeholder="11 5555 5555" /></Field>
              <Field label="Correo electrónico"><Input name="accountantEmail" type="email" defaultValue={c.accountantEmail} placeholder="contador@mail.com" /></Field>
            </div>
          </Card>
          <SaveButton />
        </form>
      )}

      {tab === "sistema" && (
        <div className="space-y-4">
          <form action={saveSystem} className="space-y-4">
            <Card title="Valores generales" subtitle="Moneda, país e impuesto que usa el sistema por defecto.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Moneda"><Input name="currency" defaultValue={s.currency} /></Field>
                <Field label="País"><Input name="country" defaultValue={s.country} /></Field>
                <Field label="Impuesto por defecto %"><Input name="taxPct" type="number" step="any" min="0" defaultValue={String(s.taxPct)} /></Field>
              </div>
            </Card>
            <Card title="Costos estimados" subtitle="Se usan en el análisis de ganancia por unidad. En 0, el sistema los calcula solo desde Gastos.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Logística por envío" hint={`Hoy: ${money(s.costs.logisticsPerShipment)}`}><Input name="logistics" type="number" step="any" min="0" defaultValue={String(s.costs.logisticsPerShipment)} /></Field>
                <Field label="Caja por pack" hint={s.costs.boxPerPack > 0 ? `Hoy: ${money(s.costs.boxPerPack)}` : "Hoy: automático"}><Input name="boxPerPack" type="number" step="any" min="0" defaultValue={String(s.costs.boxPerPack)} /></Field>
                <Field label="GNC, % de cada venta" hint={s.costs.gncPct > 0 ? `Hoy: ${s.costs.gncPct} %` : "Hoy: automático"}><Input name="gncPct" type="number" step="any" min="0" defaultValue={String(s.costs.gncPct)} /></Field>
              </div>
            </Card>
            <SaveButton />
          </form>

          <form action={saveDelivery}>
            <Card title="Entregas" subtitle="Con estas reglas el CRM calcula la fecha de entrega de cada pedido y la avisa en los mensajes. La fecha es el primer día de reparto después de la compra.">
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Días de reparto</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]] as const).map(([d, label]) => (
                      <label key={d} className="cursor-pointer">
                        <input type="checkbox" name="day" value={d} defaultChecked={delivery.days.includes(d)} className="peer sr-only" />
                        <span className="inline-flex h-9 w-14 items-center justify-center rounded-md border border-line text-sm text-muted transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Reparto desde" hint="Hora a partir de la cual se entrega."><Input name="deliveryFrom" defaultValue={delivery.from} placeholder="13:00" /></Field>
                  <Field label="Retiro de la logística: desde"><Input name="pickupFrom" defaultValue={delivery.pickupFrom} placeholder="12:30" /></Field>
                  <Field label="Retiro de la logística: hasta"><Input name="pickupTo" defaultValue={delivery.pickupTo} placeholder="13:30" /></Field>
                </div>
                <Field label="Días sin reparto" hint="Feriados o días que no se reparte, como AAAA-MM-DD separados por coma. Ese día se salta al siguiente reparto.">
                  <Input name="deliveryOff" defaultValue={delivery.off.join(", ")} placeholder="2026-12-25, 2027-01-01" />
                </Field>
              </div>
            </Card>
            <div className="mt-4"><SaveButton /></div>
          </form>

          <form action={saveQuickReplies}>
            <Card title="Respuestas rápidas" subtitle="Mensajes ya armados para las mensajerías: aparecen como botones arriba del cuadro de texto y se completan con un clic. Una por línea, con el formato  Título | texto.  Variables: {nombre} {empresa} {productos}. Para un salto de línea escribí \n. Máximo 350 caracteres cada una (límite de Mercado Libre).">
              <textarea name="replies" rows={12} defaultValue={quickToLines(quickRepliesOf(db.settings.company))} className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </Card>
            <div className="mt-4"><SaveButton /></div>
          </form>

          <Card title="Listas del sistema" subtitle="Lo que agregues acá aparece en los desplegables de todas las pantallas.">
            <div className="grid gap-3 md:grid-cols-2">
              {([["Canales de venta", s.channels, "channels"], ["Categorías de producto", s.categories, "categories"], ["Formas de pago", s.payMethods, "payMethods"], ["Categorías de gasto", s.expenseCategories, "expenseCategories"], ["Unidades", s.units, null]] as [string, string[], "channels" | "categories" | "payMethods" | "expenseCategories" | null][]).map(([title, items, key]) => (
                <div key={title} className="rounded-md border border-line p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{title}</h3>
                    {key && <CreateDrawer compact buttonLabel="Editar" variant="secondary" title={title} action={updateList.bind(null, key)} fields={[{ name: "values", label: "Separados por coma (podés agregar, quitar o cambiar el orden)", defaultValue: items.join(", "), required: true }]} />}
                  </div>
                  <div className="flex flex-wrap gap-1.5">{items.map((i) => <Badge key={i}>{i}</Badge>)}</div>
                </div>
              ))}
            </div>
            <Guide className="mt-3" title="¿Dónde edito las etapas?">Las etapas del seguimiento de envíos se editan desde la pantalla Envíos.</Guide>
          </Card>


          <Card title="Módulos del menú">
            <div className="flex flex-wrap gap-1.5">{MODULES.filter((m) => m.slug).map((m) => <Badge key={m.slug} tone={m.enabled ? "success" : "neutral"}>{m.label}</Badge>)}</div>
            <Guide className="mt-3" title="¿Por qué faltan Compras, Pedidos y Caja?">Compras, Pedidos y Caja están ocultos: sus funciones viven en Gastos y en las otras secciones.</Guide>
          </Card>

          <Card title="Datos y correo">
            <p className="text-sm text-muted">
              {db.isDemo ? "Estás viendo datos DEMO." : "Estás viendo los datos importados."} {dataSource() === "archivo" ? "Se guardan en un archivo local." : "Se guardan en la base de datos (Supabase, proyecto crm-ecommerce)."}
            </p>
            <p className="mt-2 text-sm text-muted">Correo desde el que se escribe a los clientes: <span className="font-medium text-ink">{SENDER_EMAIL}</span></p>
            {dataSource() === "archivo" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton action={restoreImportedData} label="Volver a los datos importados" />
                <ActionButton action={loadDemoData} label="Cargar datos DEMO" />
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "integraciones" && <Integrations alerts={Boolean(c.alerts?.enabled && c.alerts?.ntfyTopic)} off={c.integrationsOff ?? []} />}

      {tab === "marca" && (
        <form action={saveBrand} className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <Card title="Logo" subtitle="PNG, JPG o WEBP, hasta 2 MB. Mejor con fondo transparente y bien cuadrado o apaisado.">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-line bg-bg">
                  {b.logoUrl ? <img src={b.logoUrl} alt="Logo actual" className="max-h-full max-w-full object-contain" /> : <span className="px-2 text-center text-xs text-muted">Sin logo</span>}
                </div>
                <div className="space-y-2">
                  <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="block text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-bg" />
                  {b.logoUrl && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="removeLogo" value="1" className="h-4 w-4 accent-black" /> Quitar el logo actual</label>}
                </div>
              </div>
            </Card>
            <Card title="Identidad de marca" subtitle="Se usa en el encabezado de los presupuestos.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frase o descripción" hint="Debajo del nombre, en el presupuesto." wide><Input name="tagline" defaultValue={b.tagline} placeholder="Tu descripción acá" /></Field>
                <Field label="Color de la marca" hint="Principal: líneas y títulos destacados. Elegilo con el cuadrado o escribí / pegá el código.">
                  <ColorField name="color" defaultValue={color} />
                </Field>
                <Field label="Color secundario (claro)" hint="Reemplaza al blanco en los títulos del menú y da fondo y bordes suaves a los presupuestos e informes.">
                  <ColorField name="color2" defaultValue={soft} />
                </Field>
                <Field label="Texto al pie de los presupuestos" hint="Si lo dejás vacío se usa el texto estándar." wide>
                  <textarea name="quoteFooter" rows={3} defaultValue={b.quoteFooter} className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </Field>
              </div>
            </Card>
            <Card title="Tipografías" subtitle="Las letras de tu marca, según el manual: títulos, subtítulos y texto. Se usan en los presupuestos.">
              <FontPicker initial={brandFonts(b)} color={color} />
            </Card>
            <SaveButton />
          </div>

          <Card title="Así se ve" subtitle="Vista previa con lo guardado.">
            <div className="space-y-4">
              <div className="rounded-md bg-[#0a0a0a] p-3">
                {b.logoUrl ? (
                  <div className="mx-auto flex w-fit items-center rounded-md bg-white px-3 py-2"><img src={b.logoUrl} alt="" className="max-h-4 w-auto max-w-32 object-contain" /></div>
                ) : (
                  <p className="text-center text-sm font-semibold" style={{ color: soft }}>{s.name}</p>
                )}
                <div className="mt-3 space-y-1 text-sm font-medium" style={{ color: soft }}>
                  <p className="rounded bg-white/15 px-3 py-1.5">Dashboard</p>
                  <p className="px-3 py-1.5 opacity-80">Clientes</p>
                  <p className="px-3 py-1.5 opacity-80">Ventas</p>
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-500">Menú lateral</p>
              </div>
              <div className="rounded-md border p-3 text-gray-800" style={{ background: soft, borderColor: line }}>
                <div className="flex items-start justify-between border-b-2 pb-2" style={{ borderColor: color }}>
                  <div>
                    {b.logoUrl ? <img src={b.logoUrl} alt="" className="max-h-4 w-auto max-w-28 object-contain" /> : <p className="text-base font-bold" style={{ color }}>{s.name}</p>}
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-wide">Presupuesto</p>
                </div>
                <p className="mt-2 text-[11px] text-gray-500">{[c.address, c.city].filter(Boolean).join(", ") || "Domicilio de la empresa"}</p>
                <div className="mt-2 border-b" style={{ borderColor: line }} />
                <p className="mt-2 border-t pt-2 text-center text-[10px] text-gray-500" style={{ borderColor: line }}>{b.quoteFooter || "Presupuesto válido hasta la fecha indicada. Este documento no tiene validez como factura."}</p>
              </div>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

/** Estado de las conexiones con Mercado Libre y Tienda Nube. */
type Integration = { id?: string; name: string; detail: string; blurb: string; status: "ok" | "off" | "soon"; okLabel?: string; href?: string; logo?: string; initials: string };

async function Integrations({ alerts, off }: { alerts: boolean; off: string[] }) {
  let ml: { nickname?: unknown; status?: unknown } | null = null, tn: { store_name?: unknown; status?: unknown } | null = null;
  if (isSupabase()) {
    const sb = service();
    const projectId = await activeProjectId();
    const [a, b] = await Promise.all([
      sb.from("ml_accounts").select("nickname,status").eq("project_id", projectId).maybeSingle(),
      sb.from("tn_accounts").select("store_name,status").eq("project_id", projectId).maybeSingle(),
    ]);
    ml = a.data; tn = b.data;
  }
  const meta = metaConfigured();
  const stores: Integration[] = [
    { id: "mercadolibre", name: "Mercado Libre", detail: ml?.nickname ? String(ml.nickname) : "", blurb: "Ventas, publicaciones, preguntas y mensajes de compradores.", status: ml?.status === "connected" ? "ok" : "off", href: "/mercadolibre", logo: "/brand/mercadolibre-logo.png", initials: "ML" },
    { id: "tiendanube", name: "Tienda Nube", detail: tn?.store_name ? String(tn.store_name) : "", blurb: "Pedidos, productos, stock y clientes de tu tienda.", status: tn?.status === "connected" ? "ok" : "off", href: "/tiendanube", logo: "/brand/tiendanube-logo.png", initials: "TN" },
    { name: "Shopify", detail: "", blurb: "Otra plataforma de tiendas online.", status: "soon", logo: "/brand/shopify-logo.png", initials: "S" },
    { name: "WooCommerce", detail: "", blurb: "Tienda online sobre WordPress.", status: "soon", logo: "/brand/woocommerce-logo.png", initials: "W" },
    { name: "Empretienda", detail: "", blurb: "Plataforma argentina de tiendas online.", status: "soon", logo: "/brand/empretienda-logo.png", initials: "E" },
    { name: "VTEX", detail: "", blurb: "Plataforma de comercio para tiendas grandes.", status: "soon", logo: "/brand/vtex-logo.png", initials: "V" },
  ];
  const messaging: Integration[] = [
    { id: "whatsapp", name: "WhatsApp", detail: "mensajes de clientes", blurb: "Los mensajes entran solos a la bandeja de Mensajes.", status: meta ? "ok" : "off", okLabel: "Listo", href: "/mensajes", logo: "/brand/whatsapp-logo.png", initials: "WA" },
    { id: "instagram", name: "Instagram", detail: "mensajes directos", blurb: "Los mensajes directos entran solos a la bandeja de Mensajes.", status: meta ? "ok" : "off", okLabel: "Listo", href: "/mensajes", logo: "/brand/instagram-logo.png", initials: "IG" },
    { name: "ntfy", detail: "Notificaciones de celular", blurb: "Notificaciones cuando entra una pregunta o un mensaje.", status: alerts ? "ok" : "off", okLabel: "Activos", href: "/mensajes", logo: "/brand/ntfy-logo.svg", initials: "!" },
  ];
  const row = (i0: Integration) => {
    const disabled = Boolean(i0.id && off.includes(i0.id));
    const i: Integration = disabled ? { ...i0, status: "off" } : i0;
    return (
    <li key={i.name} className="flex min-h-[19.5rem] flex-col items-center gap-2 rounded-lg border border-line bg-bg/40 p-4 text-center">
      <span className="flex h-16 w-full max-w-[12rem] items-center justify-center rounded-lg border border-line bg-white p-2.5">{i.logo ? <img src={i.logo} alt="" className="max-h-full max-w-full object-contain" /> : <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{i.initials}</span>}</span>
      <p className="min-h-10 font-semibold">{i.name}{i.detail && <span className="block text-xs font-normal text-muted">{i.detail}</span>}</p>
      <p className="min-h-8 text-xs text-muted">{i.blurb}</p>
      <Badge tone={disabled ? "neutral" : i.status === "ok" ? "success" : i.status === "soon" ? "neutral" : "warning"} fixed>{disabled ? "Desactivada" : i.status === "ok" ? (i.okLabel ?? "Conectada") : i.status === "soon" ? "Próximamente" : "Sin conectar"}</Badge>
      <div className="mt-auto flex w-full flex-col gap-2 pt-1">
      {i.href && !disabled ? <Link href={i.href} className="inline-flex h-9 w-full items-center justify-center rounded-md border border-line bg-surface text-sm font-medium hover:bg-bg">{i.status === "ok" ? "Abrir" : "Conectar"}</Link> : <span className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center rounded-md border border-dashed border-line text-sm text-muted/70">{disabled ? "Desactivada para este negocio" : "Todavía no disponible"}</span>}
      {i.id && <div className="flex w-full [&_button]:w-full"><ActionButton action={setIntegration.bind(null, i.id, disabled)} label={disabled ? "Activar" : "Desactivar"} variant="secondary" tall block /></div>}
      </div>
    </li>
  ); };
  return (
    <div className="space-y-4">
      <Card title="Tiendas online" subtitle="Dónde vendés. Cada negocio usa solo las suyas: desactivá las que no necesites y se ocultan del menú. Las que dicen «Próximamente» todavía no están construidas.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{stores.map(row)}</ul>
      </Card>
      <Card title="Mensajería y avisos" subtitle="Cómo te llegan los mensajes de tus clientes y los avisos.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{messaging.map(row)}</ul>
        <Guide className="mt-3" title="¿Cómo conecto WhatsApp e Instagram?">Hay que crear una app en Meta (developers.facebook.com), cargar sus claves en el servidor y pegar las direcciones de los webhooks. Los pasos exactos y las direcciones están en la pantalla Mensajes, en «Canales conectados».</Guide>
      </Card>
    </div>
  );
}
