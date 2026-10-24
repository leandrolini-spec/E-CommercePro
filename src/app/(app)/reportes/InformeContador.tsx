import Link from "next/link";
import { MonthPicker } from "@/components/shared/MonthPicker";
import { IconDownload, IconMail, IconWhatsApp } from "@/components/shared/icons";
import { gmailLink, waLink } from "@/lib/contact";
import { fdate, money, today } from "@/lib/format";
import { buildInforme, informeToken, mesesDisponibles, monthLabel, validMes } from "@/modules/informe";
import type { Db } from "@/modules/types";
import { Guide } from "@/components/ui/Guide";

const btn = "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition";

/** Informe mensual para la contadora o el contador: PDF descargable y mensaje listo para mandárselo por WhatsApp o correo. */
export function InformeContador({ db, mes: mesParam, report, period }: { db: Db; mes: string; report: string; period: string }) {
  const meses = mesesDisponibles(today());
  const mes = validMes(mesParam) && meses.includes(mesParam) ? mesParam : meses[0];
  const d = buildInforme(db, mes, today());
  const c = db.settings.company ?? {};
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  const link = `${base}/api/informe?mes=${mes}&t=${informeToken(mes)}`;
  const first = (c.accountantName ?? "").split(" ")[0];
  const text = `Hola${first ? ` ${first}` : ""}! Te paso el informe de ventas y gastos de ${monthLabel(mes)} de ${db.settings.name}. Lo podés ver y descargar acá: ${link}\n\nCualquier duda avisame. Gracias!`;
  const wa = c.accountantPhone ? waLink(c.accountantPhone, text) : null;
  const mail = c.accountantEmail && /.+@.+\..+/.test(c.accountantEmail) ? gmailLink(c.accountantEmail, `Informe ${monthLabel(mes)} - ${db.settings.name}`, text) : null;
  const off = `${btn} cursor-not-allowed border-line bg-bg text-muted/60`;
  const kpis: [string, string][] = [["Ventas", String(d.summary.count)], ["Ingresos brutos", money(d.summary.gross)], ["Ingresos netos", money(d.summary.net)], ["Gastos operativos", money(d.summary.operating)], ["Resultado", money(d.summary.result)]];

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Mes</span>
        <MonthPicker selected={mes} hrefs={Object.fromEntries(meses.map((m) => [m, `?r=${report}&p=${period}&mes=${m}`]))} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-bg px-3 py-2 text-center">
            <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
            <dd className="text-sm font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href={`/api/informe?mes=${mes}`} download={`informe-${mes}.pdf`} className={`${btn} border-primary bg-primary text-white hover:bg-primary-hover`}><IconDownload />Descargar PDF</a>
        {wa ? <a href={wa} target="_blank" rel="noreferrer" title={`Mandar el informe por WhatsApp a ${c.accountantPhone}`} className={`${btn} border-[#16a34a]/40 bg-[#16a34a]/10 text-[#15803d] hover:bg-[#16a34a]/20`}><IconWhatsApp />Enviar por WhatsApp</a> : <span title="Cargá el WhatsApp del contador/a" className={off}><IconWhatsApp />Enviar por WhatsApp</span>}
        {mail ? <a href={mail} target="_blank" rel="noreferrer" title={`Mandar el informe por correo a ${c.accountantEmail}`} className={`${btn} border-[#2563eb]/40 bg-[#2563eb]/10 text-[#1d4ed8] hover:bg-[#2563eb]/20`}><IconMail />Enviar por correo</a> : <span title="Cargá el correo del contador/a" className={off}><IconMail />Enviar por correo</span>}
      </div>
      <Guide className="mt-3" title="¿Cómo se envía el informe?"><p>
        {c.accountantName || c.accountantPhone || c.accountantEmail ? <>Contador/a: <strong className="text-ink">{[c.accountantName, c.accountantPhone, c.accountantEmail].filter(Boolean).join(" · ")}</strong>. </> : <>Todavía no cargaste los datos del contador/a: se cargan en <Link href="/configuracion" className="font-medium text-primary underline">Configuración → Empresa</Link>. </>}
        Al tocar enviar se abre WhatsApp o tu correo con el mensaje y el enlace al PDF ya escritos; el mensaje lo mandás vos. El enlace solo abre el informe de {monthLabel(mes)}, sin iniciar sesión. Generado con datos al {fdate(today())}.
      </p></Guide>
    </section>
  );
}
