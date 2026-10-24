"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const PIECES = ["💵", "💰", "🪙", "💸", "🤑", "💵", "🪙"];


type Notif = { id: string; type: "venta" | "mensaje" | "pregunta" | "envio" | "reembolso"; title: string; detail: string; href: string; at: string };

const KEY = "crm_notifs_vistas";
const KEY_FEST = "crm_ventas_festejadas";
function readFest(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(KEY_FEST) ?? "[]") as string[]); } catch { return new Set(); } }
function writeFest(s: Set<string>) { try { localStorage.setItem(KEY_FEST, JSON.stringify([...s].slice(-300))); } catch { /* idem */ } }
const META: Record<Notif["type"], { label: string; color: string; icon: string }> = {
  venta: { label: "Ventas", color: "#16a34a", icon: "$" },
  mensaje: { label: "Mensajes de ML", color: "#f59e0b", icon: "✉" },
  pregunta: { label: "Preguntas de ML", color: "#7c3aed", icon: "?" },
  envio: { label: "Envíos", color: "#2563eb", icon: "🚚" },
  reembolso: { label: "Reembolsos", color: "#dc2626", icon: "↩" },
};

function readSeen(): Set<string> | null {
  try { const raw = localStorage.getItem(KEY); return raw ? new Set(JSON.parse(raw) as string[]) : null; } catch { return null; }
}
function writeSeen(s: Set<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...s].slice(-600))); } catch { /* sin almacenamiento: se muestran todos como nuevos */ }
}

// El navegador (sobre todo en el celular) solo deja sonar después de un toque: el primer toque en la pantalla prepara el audio.
let sharedCtx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx ??= new Ctx();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch { return null; }
}

/** Campanita de aviso (dos notas graves y largas, "din-don"): suena distinto de la caja registradora de las ventas. */
function bell() {
  try {
    const ac = audio();
    if (!ac) return;
    [[880, 0], [659.25, 0.45]].forEach(([f, t]) => {
      [1, 2.01].forEach((mult, k) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f * mult; o.connect(g); g.connect(ac.destination);
        const peak = k === 0 ? 0.32 : 0.1;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(peak, ac.currentTime + t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 1.1);
        o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 1.15);
      });
    });
    navigator.vibrate?.([180, 90, 180]);
  } catch { /* sin sonido */ }
}

/** Sonido corto de caja registradora (si el navegador no deja reproducir sonido, se omite). */
function chaChing() {
  try {
    const ac = audio();
    if (!ac) return;
    [[1318.5, 0], [1760, 0.12], [2093, 0.26]].forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.5);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.55);
    });
  } catch { /* sin sonido */ }
}

/** Festejo de venta: lluvia de billetes y monedas con el monto, que se va solo a los pocos segundos. */
function SaleCelebration({ sales, onClose }: { sales: Notif[]; onClose: () => void }) {
  useEffect(() => { chaChing(); const t = setTimeout(onClose, 9000); return () => clearTimeout(t); }, [onClose]);
  const first = sales[0];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" role="status" aria-live="polite">
      <style>{`
        @keyframes sale-fall { 0% { transform: translateY(-12vh) rotate(0deg); opacity: 0 } 8% { opacity: 1 } 100% { transform: translateY(112vh) rotate(540deg); opacity: 1 } }
        @keyframes sale-pop { 0% { transform: translateY(-40px) scale(.7); opacity: 0 } 55% { transform: translateY(6px) scale(1.06); opacity: 1 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
        @keyframes sale-shine { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        @keyframes sale-bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @media (prefers-reduced-motion: reduce) { .sale-piece { display: none } .sale-card, .sale-emoji { animation: none !important } }
      `}</style>
      {Array.from({ length: 36 }, (_, i) => (
        <span key={i} className="sale-piece absolute top-0 select-none" style={{ left: `${(i * 97) % 100}%`, fontSize: 22 + ((i * 13) % 22), animation: `sale-fall ${3.6 + ((i * 7) % 28) / 10}s linear ${((i * 11) % 30) / 10}s 2 both` }} aria-hidden>{PIECES[i % PIECES.length]}</span>
      ))}
      <div className="absolute inset-x-0 top-6 flex justify-center px-4">
        <button type="button" onClick={onClose} className="sale-card pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-[#fbbf24] p-5 text-left text-white shadow-2xl"
          style={{ background: "linear-gradient(110deg,#047857,#16a34a,#22c55e,#16a34a,#047857)", backgroundSize: "200% 100%", animation: "sale-pop .6s ease-out both, sale-shine 3s linear infinite" }}>
          <span className="flex items-center gap-4">
            <span className="sale-emoji text-5xl" style={{ animation: "sale-bounce .8s ease-in-out infinite" }} aria-hidden>💰</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-widest text-[#fde68a]">{sales.length > 1 ? `${sales.length} ventas nuevas` : "Entró una venta"}</span>
              <span className="block text-2xl font-extrabold leading-tight">¡Venta! {first.title.split("·")[1]?.trim() ?? ""}</span>
              <span className="mt-0.5 block truncate text-sm text-white/90">{first.detail}</span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Aviso visible cuando un pedido llegó a destino: tarjeta con tilde animado, se va sola. */
function ArrivalBanner({ items, onClose, refund = false }: { items: Notif[]; onClose: () => void; refund?: boolean }) {
  useEffect(() => { const t = setTimeout(onClose, 10000); return () => clearTimeout(t); }, [onClose]);
  const first = items[0];
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <style>{`
        @keyframes arr-in { 0% { transform: translateY(-30px) scale(.9); opacity: 0 } 100% { transform: none; opacity: 1 } }
        @keyframes arr-ring { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.55) } 100% { box-shadow: 0 0 0 22px rgba(37,99,235,0) } }
        @keyframes arr-draw { 0% { stroke-dashoffset: 30 } 100% { stroke-dashoffset: 0 } }
        @media (prefers-reduced-motion: reduce) { .arr-card, .arr-ring, .arr-check { animation: none !important } }
      `}</style>
      <Link href={refund ? "/ventas" : "/envios"} onClick={onClose} className={`arr-card pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-2xl border-2 bg-white p-4 shadow-2xl ${refund ? "border-[#dc2626]" : "border-[#2563eb]"}`} style={{ animation: "arr-in .5s ease-out both" }}>
        <span className={`arr-ring flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white ${refund ? "bg-[#dc2626]" : "bg-[#2563eb]"}`} style={{ animation: "arr-ring 1.4s ease-out 3" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8" aria-hidden>
            <path className="arr-check" d="m5 12.5 4.5 4.5L19 7.5" strokeDasharray="30" style={{ animation: "arr-draw .7s ease-out .3s both" }} />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-bold uppercase tracking-widest ${refund ? "text-[#dc2626]" : "text-[#2563eb]"}`}>{refund ? (items.length > 1 ? `${items.length} ventas para reembolsar` : "Venta caída: hay que reembolsar") : items.length > 1 ? `${items.length} pedidos llegaron` : "Llegó a destino"}</span>
          <span className="block truncate text-lg font-extrabold text-ink">{refund ? first.title.replace(/^Venta cancelada /, "") : first.title.replace(/^Envío entregado: /, "")}</span>
          <span className="block truncate text-sm text-muted">{first.detail}</span>
        </span>
      </Link>
    </div>
  );
}

/** Aviso visible cuando entra una pregunta o un mensaje de un comprador: tarjeta con la campanita, se va sola (o al tocarla). */
function InboxBanner({ items, onClose }: { items: Notif[]; onClose: () => void }) {
  useEffect(() => { bell(); const t = setTimeout(onClose, 12000); return () => clearTimeout(t); }, [onClose]);
  const first = items[0];
  const isQ = first.type === "pregunta";
  const color = isQ ? "#7c3aed" : "#f59e0b";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <style>{`
        @keyframes inb-in { 0% { transform: translateY(-30px) scale(.92); opacity: 0 } 100% { transform: none; opacity: 1 } }
        @keyframes inb-ring { 0%,100% { transform: rotate(0) } 15% { transform: rotate(16deg) } 30% { transform: rotate(-14deg) } 45% { transform: rotate(10deg) } 60% { transform: rotate(-8deg) } 75% { transform: rotate(4deg) } }
        @media (prefers-reduced-motion: reduce) { .inb-card, .inb-bell { animation: none !important } }
      `}</style>
      <Link href={first.href.startsWith("/mensajes") ? first.href : "/mensajes"} onClick={onClose} className="inb-card pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-2xl border-2 bg-white p-4 shadow-2xl" style={{ borderColor: color, animation: "inb-in .45s ease-out both" }}>
        <span className="inb-bell flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color, animation: "inb-ring 1.1s ease-in-out 3", transformOrigin: "50% 15%" }}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8" aria-hidden><path d="M10 2a5 5 0 0 0-5 5v2.6c0 .5-.2 1-.5 1.4L3.3 12.4A1 1 0 0 0 4 14h12a1 1 0 0 0 .7-1.6l-1.2-1.4a2.2 2.2 0 0 1-.5-1.4V7a5 5 0 0 0-5-5Zm-2 13a2 2 0 1 0 4 0H8Z" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-widest" style={{ color }}>{items.length > 1 ? `${items.length} ${isQ ? "preguntas" : "mensajes"} nuevos` : isQ ? "Pregunta nueva" : "Mensaje nuevo"}</span>
          <span className="block truncate text-lg font-extrabold text-ink">{first.title}</span>
          <span className="block truncate text-sm text-muted">{first.detail}</span>
        </span>
      </Link>
    </div>
  );
}

/** Campanita de avisos: ventas, mensajes y preguntas de Mercado Libre y estados de envíos. */
export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Notif["type"] | "todo">("todo");
  const [celebrate, setCelebrate] = useState<Notif[]>([]);
  const [arrivals, setArrivals] = useState<Notif[]>([]);
  const [refunds, setRefunds] = useState<Notif[]>([]);
  const [inbox, setInbox] = useState<Notif[]>([]);
  const celebrated = useRef<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Notif[] };
      setItems(data.items);
      const stored = readSeen();
      if (stored) {
        setSeen(stored);
        // Ventas que aparecen por primera vez: festejo (una sola vez por venta).
        const done = readFest();
        const fresh = data.items.filter((i) => i.type === "venta" && !stored.has(i.id) && !done.has(i.id) && !celebrated.current.has(i.id));
        if (fresh.length) { fresh.forEach((i) => { celebrated.current.add(i.id); done.add(i.id); }); writeFest(done); setCelebrate(fresh); }
        // Pedidos que llegaron a destino (estado del envío o calificación del comprador).
        const arr = data.items.filter((i) => i.type === "envio" && i.id.endsWith(":entregado") && !stored.has(i.id) && !done.has(i.id) && !celebrated.current.has(i.id));
        const ref = data.items.filter((i) => i.type === "reembolso" && !stored.has(i.id) && !done.has(i.id) && !celebrated.current.has(i.id));
        // Preguntas y mensajes de compradores que entran: campanita propia (distinta de la de ventas).
        const inb = data.items.filter((i) => (i.type === "pregunta" || i.type === "mensaje") && !stored.has(i.id) && !done.has(i.id) && !celebrated.current.has(i.id));
        if (inb.length) { inb.forEach((i) => { celebrated.current.add(i.id); done.add(i.id); }); writeFest(done); setInbox(inb); }
        if (ref.length) { ref.forEach((i) => { celebrated.current.add(i.id); done.add(i.id); }); writeFest(done); setRefunds(ref); }
        if (arr.length) { arr.forEach((i) => { celebrated.current.add(i.id); done.add(i.id); }); writeFest(done); setArrivals(arr); }
      }
      else { // primera vez en este navegador: lo que ya existe no se cuenta como nuevo
        const first = new Set(data.items.map((i) => i.id));
        writeSeen(first);
        writeFest(first);
        setSeen(first);
      }
    } catch { /* sin conexión: se reintenta */ }
  }, []);

  // Pruebas: ?festejo=prueba (venta) y ?entrega=prueba (pedido entregado). No tocan ningún dato.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = setTimeout(() => {
      if (q.get("festejo") === "prueba") setCelebrate([{ id: "prueba", type: "venta", title: "Nueva venta V-000 · $ 33.000", detail: "Prueba: 45 Productos de ejemplo · Mercado Libre", href: "/ventas", at: new Date().toISOString() }]);
      if (q.get("reembolso") === "prueba") setRefunds([{ id: "prueba-r", type: "reembolso", title: "Venta cancelada V-000 · reembolsar $ 33.000", detail: "Prueba: Mercado Libre · 45 × Productos de ejemplo", href: "/ventas", at: new Date().toISOString() }]);
      if (q.get("aviso") === "prueba") setInbox([{ id: "prueba-a", type: "pregunta", title: "Pregunta nueva en Mercado Libre", detail: "Prueba: 45 Productos de ejemplo", href: "/mensajes", at: new Date().toISOString() }]);
      if (q.get("entrega") === "prueba") setArrivals([{ id: "prueba-e", type: "envio", title: "Envío entregado: María Pérez", detail: "45 × Productos de ejemplo · Monserrat, CABA", href: "/envios", at: new Date().toISOString() }]);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // El primer toque en la pantalla habilita el sonido de los avisos (el navegador no deja sonar antes).
  useEffect(() => {
    const unlock = () => { audio(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 45_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = items.filter((i) => !seen.has(i.id));
  const shown = items.filter((i) => filter === "todo" || i.type === filter);
  // Lo leído de Mercado Libre también se guarda en el servidor, así no vuelve a avisar en otro navegador o dispositivo.
  const tellServer = (ids: string[]) => { const mine = ids.filter((i) => i.startsWith("msg:") || i.startsWith("q:")); if (mine.length) fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: mine }) }).catch(() => {}); };
  function markAll() { const next = new Set(items.map((i) => i.id)); writeSeen(next); setSeen(next); tellServer(items.filter((i) => !seen.has(i.id)).map((i) => i.id)); }
  function markOne(id: string) { const next = new Set(seen).add(id); writeSeen(next); setSeen(next); tellServer([id]); }

  return (
    <div ref={box} className="relative">
      {refunds.length > 0 && celebrate.length === 0 && <ArrivalBanner refund items={refunds} onClose={() => setRefunds([])} />}
      {arrivals.length > 0 && celebrate.length === 0 && refunds.length === 0 && <ArrivalBanner items={arrivals} onClose={() => setArrivals([])} />}
      {inbox.length > 0 && celebrate.length === 0 && refunds.length === 0 && arrivals.length === 0 && <InboxBanner items={inbox} onClose={() => setInbox([])} />}
      {celebrate.length > 0 && <SaleCelebration sales={celebrate} onClose={() => setCelebrate([])} />}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notificaciones${unread.length ? `: ${unread.length} nuevas` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm hover:bg-bg">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden><path d="M10 2a5 5 0 0 0-5 5v2.6c0 .5-.2 1-.5 1.4L3.3 12.4A1 1 0 0 0 4 14h12a1 1 0 0 0 .7-1.6l-1.2-1.4a2.2 2.2 0 0 1-.5-1.4V7a5 5 0 0 0-5-5Zm-2 14a2 2 0 0 0 4 0H8Z" /></svg>
        {unread.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{unread.length > 99 ? "99+" : unread.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notificaciones {unread.length > 0 && <span className="ml-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">{unread.length} nuevas</span>}</p>
            {unread.length > 0 && <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">Marcar todas como leídas</button>}
          </div>
          <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
            {(["todo", "venta", "mensaje", "pregunta", "envio", "reembolso"] as const).map((k) => {
              const n = k === "todo" ? items.length : items.filter((i) => i.type === k).length;
              return (
                <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === k ? "border-primary bg-primary text-white" : "border-line text-muted hover:text-ink"}`}>
                  {k === "todo" ? "Todas" : META[k].label} <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No hay avisos.</li>}
            {shown.map((n) => {
              const m = META[n.type], isNew = !seen.has(n.id);
              return (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => { markOne(n.id); setOpen(false); }} className={`flex gap-3 px-4 py-3 hover:bg-bg ${isNew ? "bg-primary/5" : ""}`}>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }} aria-hidden>{m.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{n.title}</span>{isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Nuevo" />}</span>
                      <span className="line-clamp-2 text-xs text-muted">{n.detail}</span>
                      <span className="mt-0.5 block text-[11px] text-muted/80">{m.label} · {n.at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? "hoy" : n.at.slice(0, 10).split("-").reverse().join("/")}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
