/**
 * Lee el mensaje de un comprador y separa sus datos de entrega: teléfono, dirección, localidad, código postal, DNI y nombre.
 * Es una lectura por reglas (sin inteligencia artificial): sirve para sugerir los datos, que siempre confirma una persona.
 * Si el comprador respondió en el formato pedido ("Teléfono: …", "Dirección: …", "Localidad: …") la lectura es casi exacta.
 */
export type Detected = { name?: string; phone?: string; address?: string; city?: string; zip?: string; doc?: string };

const LABELS: [keyof Detected, RegExp][] = [
  ["name", /^(?:nombre(?: y apellido)?|apellido y nombre|me llamo|soy)\b[^:\n]*[:\-–]?\s*/i],
  ["phone", /^(?:tel[eé]fono|tel|cel(?:ular)?|whats\s?app|wsp|contacto|n[uú]mero)\b[^:\n]*[:\-–]\s*/i],
  ["address", /^(?:direcci[oó]n|domicilio|calle|entrega en|enviar a)\b[^:\n]*[:\-–]\s*/i],
  ["city", /^(?:localidad|ciudad|barrio|partido|zona|provincia)\b[^:\n]*[:\-–]\s*/i],
  ["zip", /^(?:c\.?\s?p\.?|c[oó]digo postal)\b[^:\n]*[:\-–]?\s*/i],
  ["doc", /^(?:dni|documento|d\.n\.i\.?)\b[^:\n]*[:\-–]?\s*/i],
];

const digits = (s: string) => s.replace(/\D/g, "");
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, "").trim();

/** Teléfono argentino: 10 a 13 dígitos (con o sin +54, 9 o 0). Devuelve el número tal como lo escribió la persona, prolijo. */
function phoneIn(text: string): string | undefined {
  const re = /(?:\+?\s?54[\s.-]?)?(?:9[\s.-]?)?\(?0?\d{2,4}\)?[\s.-]?(?:15[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;
  for (const m of text.matchAll(re)) {
    const d = digits(m[0]);
    if (d.length >= 10 && d.length <= 13) return clean(m[0]);
  }
  return undefined;
}

export function extractContact(raw: string): Detected {
  const out: Detected = {};
  const lines = raw.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean);
  const used = new Set<number>();

  // 1) Líneas con título ("Teléfono: 11 5555-1234").
  lines.forEach((line, i) => {
    for (const [key, re] of LABELS) {
      const m = line.match(re);
      if (!m) continue;
      const value = clean(line.slice(m[0].length));
      if (!value) continue;
      if (key === "phone") { const p = phoneIn(value) ?? (digits(value).length >= 8 ? value : undefined); if (p && !out.phone) { out.phone = clean(p); used.add(i); } }
      else if (key === "doc") { const d = digits(value); if (d.length >= 7 && d.length <= 8 && !out.doc) { out.doc = d; used.add(i); } }
      else if (key === "zip") { const z = value.match(/[A-Za-z]?\d{4}[A-Za-z]{0,3}/)?.[0]; if (z && !out.zip) { out.zip = z.toUpperCase(); used.add(i); } }
      else if (!out[key]) { out[key] = value; used.add(i); }
      break;
    }
  });

  // 2) Lo que falte, buscado en el texto suelto.
  const looseLines = lines.filter((_, i) => !used.has(i));
  const loose = looseLines.join("\n");
  if (!out.phone) out.phone = phoneIn(loose);
  if (!out.doc) { const d = loose.match(/\b(?:dni|documento)\D{0,4}(\d{1,2}\.?\d{3}\.?\d{3})\b/i); if (d) out.doc = digits(d[1]); }
  if (!out.zip) { const z = loose.match(/\b(?:c\.?\s?p\.?|c[oó]digo postal)\s*[:.]?\s*([A-Za-z]?\d{4}[A-Za-z]{0,3})\b/i); if (z) out.zip = z[1].toUpperCase(); }
  if (!out.name) { const n = loose.match(/\b(?:[Mm]i nombre es|[Mm]e llamo|[Ss]oy)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,3})/); if (n) out.name = n[1]; }
  if (!out.address) {
    // Sin el teléfono, el DNI ni el código postal en el medio; las abreviaturas ("Av.") pierden el punto para no cortar la oración.
    const strip = (t: string) => {
      let r = t;
      if (out.phone) r = r.replace(out.phone, " ");
      return r.replace(/\b(av|avda|pje|bv|dr|gral|cnel|dpto|depto)\.\s*/gi, "$1 ").replace(/\b(?:dni|documento)\D{0,4}[\d.]{7,10}/gi, " ").replace(/\b(?:c\.?\s?p\.?|c[oó]digo postal)\s*[:.]?\s*[A-Za-z]?\d{4}[A-Za-z]{0,3}/gi, " ");
    };
    const sentences = strip(loose).split(/[\n;!?]|\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).map(clean).filter(Boolean);
    const withKw = /\b(?:av|avda|avenida|calle|pasaje|pje|ruta|bv|boulevard|diagonal|camino)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9][^,\n]{1,45}?\s+\d{1,5}\b/i;
    const plain = /\b[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ'.]*(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ'.]+){0,4}\s+\d{2,5}\b/;
    const stop = /^(?:hola|gracias|buen|mi n[uú]mero|mi tel|dni|quiero|necesito|pedido|compr)/i;
    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      const m = sent.match(withKw) ?? (stop.test(sent) ? null : sent.match(plain));
      if (!m || /\b(?:productos|bandejas?|unidades|pesos)\b/i.test(m[0])) continue;
      const tail = sent.slice((m.index ?? 0) + m[0].length);
      let addr = clean(m[0] + (/^\s*(?:piso|pb|depto|dpto|torre|entre|esq|esquina|e\/)/i.test(tail) ? tail.split(",")[0] : ""));
      addr = addr.replace(/^(?:mi\s+)?(?:direcci[oó]n|domicilio)\s*(?:es)?\s*[:\-]?\s*/i, "").replace(/^.*?\b(?:vivo en|estoy en|en)\s+(?=(?:av|avda|avenida|calle|pasaje|pje|ruta|bv|boulevard|diagonal|camino)\b)/i, "");
      out.address = addr;
      if (!out.city) {
        const after = tail.replace(/^[^,]*,/, "").split(/[,.]/)[0];
        const c = clean(/^\s*(?:piso|pb|depto|dpto|torre|entre|esq|esquina|e\/)/i.test(tail) ? tail.split(",")[1] ?? "" : after);
        // La localidad también puede venir en el renglón siguiente ("Lanús este").
        const next = sentences[i + 1];
        if (c && !/\d/.test(c) && c.length <= 40) out.city = c;
        else if (next && !/\d/.test(next) && next.length <= 40 && !stop.test(next)) out.city = next;
      }
      break;
    }
  }
  // "Belgrano 123, Quilmes" escrito en el campo de dirección: lo que sigue a la coma es la localidad.
  if (out.address && !out.city && out.address.includes(",")) {
    const [first, ...rest] = out.address.split(",").map(clean);
    const city = rest.join(", ");
    if (first && city && !/\d/.test(city)) { out.address = first; out.city = city; }
  }
  if (out.name) out.name = out.name.replace(/\s+(?:y|e)\s+mi\s+.*/i, "");
  // Una "dirección" o "nombre" que en realidad es un teléfono o un número suelto no sirve.
  if (out.address && /^\d+$/.test(digits(out.address)) && out.address.replace(/\D/g, "").length === out.address.replace(/\s/g, "").length) delete out.address;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => !!v)) as Detected;
}

/** Une los datos detectados en varios mensajes: gana lo más reciente. */
export function extractFromMessages(texts: string[]): Detected {
  const merged: Detected = {};
  for (const t of texts) Object.assign(merged, extractContact(t));
  return merged;
}
