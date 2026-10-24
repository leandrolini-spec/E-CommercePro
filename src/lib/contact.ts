/** Cuenta desde la que se escribe a los clientes (se abre el redactor de Gmail con esta cuenta). */
export const SENDER_EMAIL = "info@example.com";

/** Número en formato internacional para WhatsApp (Argentina: 54 9 + área + número). Devuelve null si no parece un teléfono. */
export function waNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) return d.startsWith("549") ? d : `549${d.slice(2)}`;
  if (d.startsWith("0")) d = d.slice(1);
  // Celulares de Argentina escritos con "15" después del código de área: 11 15 1234 5678 → 11 1234 5678.
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, (_, a, b) => (a.length + b.length === 10 ? `${a}${b}` : _));
  return d.length === 10 ? `549${d}` : d.length >= 11 ? d : null;
}

export const waLink = (phone: string, text?: string) => {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
};

/** Abre el redactor de Gmail con la cuenta del negocio y el destinatario cargado. */
export const gmailLink = (to: string, subject = "", body = "") =>
  `https://mail.google.com/mail/?view=cm&fs=1&authuser=${encodeURIComponent(SENDER_EMAIL)}&to=${encodeURIComponent(to)}${subject ? `&su=${encodeURIComponent(subject)}` : ""}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
