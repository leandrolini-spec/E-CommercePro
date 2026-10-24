/** Cómo se envía un pedido. Sin dato (o un valor viejo) vale Logística. El chofer solo existe en reparto propio. */
export const CARRIERS = [
  ["logistica", "Logística"], ["propio", "Reparto propio"], ["logistica_ml", "Logística ML"], ["andreani", "Andreani"], ["correo", "Correo Argentino"], ["viacargo", "Vía Cargo (interior)"],
] as const;

export const carrierOf = (c?: string) => (CARRIERS.some((x) => x[0] === c) ? (c as string) : "logistica");
export const isOwn = (c?: string) => carrierOf(c) === "propio";
/** Transportes con plazo según el destino y n.º de seguimiento propio (no hay fecha fija de reparto). */
export const isExternal = (c?: string) => ["andreani", "correo", "viacargo"].includes(carrierOf(c));
export const carrierName = (c?: string) => {
  const k = carrierOf(c);
  return k === "viacargo" ? "Vía Cargo" : (CARRIERS.find((x) => x[0] === k)?.[1] ?? "Logística");
};

/** Color de la etiqueta de cada transporte (para verlo de un vistazo en las tarjetas de Envíos). */
export const CARRIER_COLORS: Record<string, string> = {
  logistica: "#0369a1", propio: "#15803d", logistica_ml: "#a16207", andreani: "#b91c1c", correo: "#4338ca", viacargo: "#c2410c",
};
export const carrierColor = (c?: string) => CARRIER_COLORS[carrierOf(c)] ?? "#475569";
