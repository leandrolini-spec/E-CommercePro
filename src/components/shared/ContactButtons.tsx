import { gmailLink, waLink } from "@/lib/contact";

const BASE = "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition";
const BASE_ICON = "inline-flex h-8 w-8 items-center justify-center rounded-md border transition";
const BASE_SMALL = "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition";

/** Botones para escribirle a un cliente por WhatsApp o por correo (grises si falta el dato). */
export function ContactButtons({ name, phone, email, small = false, iconOnly = false }: { name: string; phone?: string; email?: string; small?: boolean; /** Cuadrados de 32 px con solo el ícono (el texto queda al pasar el mouse). */ iconOnly?: boolean }) {
  const base = iconOnly ? BASE_ICON : small ? BASE_SMALL : BASE;
  const icon = iconOnly ? "h-4 w-4" : small ? "h-3 w-3" : "h-3.5 w-3.5";
  const first = name.split(" ")[0];
  const wa = phone ? waLink(phone, `Hola ${first}! Te escribimos del negocio.`) : null;
  const mail = email && /.+@.+\..+/.test(email) ? gmailLink(email, "Negocio", `Hola ${first},\n\n`) : null;
  return (
    <div className={`flex items-center ${iconOnly ? "gap-1" : "gap-1.5"}`}>
      {wa ? (
        <a href={wa} target="_blank" rel="noreferrer" title={`Escribir por WhatsApp a ${phone}`} className={`${base} border-[#16a34a]/40 bg-[#16a34a]/10 text-[#15803d] hover:bg-[#16a34a]/20`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className={icon} aria-hidden><path d="M10 2a8 8 0 0 0-6.9 12l-1 3.6a.6.6 0 0 0 .7.8l3.7-1A8 8 0 1 0 10 2Zm4.2 11.3c-.2.5-1.1 1-1.5 1-.4.1-.9.1-2.4-.5-2-.9-3.3-2.9-3.4-3-.1-.1-.8-1.1-.8-2s.5-1.4.7-1.6c.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .4.3l.6 1.5c.1.1.1.3 0 .4l-.3.4-.3.3c-.1.1-.2.3-.1.4.5.9 1.2 1.6 2.1 2.1.2.1.3.1.4 0l.5-.6c.1-.2.3-.2.5-.1l1.4.7c.2.1.3.2.3.3 0 .2 0 .7-.2 1.1Z" /></svg>
          {!iconOnly && "WhatsApp"}
        </a>
      ) : (
        <span title={phone ? "El teléfono no parece válido: corregilo con Editar" : "Falta el teléfono: cargalo con Editar"} className={`${base} cursor-not-allowed border-line bg-bg text-muted/70`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className={icon} aria-hidden><path d="M10 2a8 8 0 0 0-6.9 12l-1 3.6a.6.6 0 0 0 .7.8l3.7-1A8 8 0 1 0 10 2Z" /></svg>
          {!iconOnly && "WhatsApp"}
        </span>
      )}
      {mail ? (
        <a href={mail} target="_blank" rel="noreferrer" title={`Escribir un correo a ${email}`} className={`${base} border-primary/40 bg-primary/10 text-primary hover:bg-primary/20`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className={icon} aria-hidden><path d="M2.5 5.4A2 2 0 0 1 4.5 3.5h11a2 2 0 0 1 2 1.9L10 10.2 2.5 5.4Zm0 1.9v7.3a2 2 0 0 0 2 1.9h11a2 2 0 0 0 2-1.9V7.3l-7 4.5a1 1 0 0 1-1 0l-7-4.5Z" /></svg>
          {!iconOnly && "Correo"}
        </a>
      ) : (
        <span title={email ? "El email no parece válido: corregilo con Editar" : "Falta el email: cargalo con Editar"} className={`${base} cursor-not-allowed border-line bg-bg text-muted/70`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className={icon} aria-hidden><path d="M2.5 5.4A2 2 0 0 1 4.5 3.5h11a2 2 0 0 1 2 1.9L10 10.2 2.5 5.4Z" /></svg>
          {!iconOnly && "Correo"}
        </span>
      )}
    </div>
  );
}

/** Abre WhatsApp con un mensaje ya escrito (el aviso de la etapa del envío). Gris si falta el teléfono. */
export function WhatsAppNotify({ phone, text, label = "Avisar por WhatsApp", block = false }: { phone?: string; text: string; label?: string; block?: boolean }) {
  const size = block ? "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition" : BASE;
  const link = phone ? waLink(phone, text) : null;
  const icon = <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M10 2a8 8 0 0 0-6.9 12l-1 3.6a.6.6 0 0 0 .7.8l3.7-1A8 8 0 1 0 10 2Z" /></svg>;
  return link ? (
    <a href={link} target="_blank" rel="noreferrer" title={text} className={`${size} border-[#16a34a]/40 bg-[#16a34a] text-white hover:bg-[#15803d]`}>{icon}{label}</a>
  ) : (
    <span title={phone ? "El teléfono no parece válido: corregilo con Editar" : "Falta el teléfono del cliente: cargalo con Editar"} className={`${size} cursor-not-allowed border-line bg-bg text-muted/70`}>{icon}{label}</span>
  );
}
