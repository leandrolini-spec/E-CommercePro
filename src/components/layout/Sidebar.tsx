"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ModuleDef } from "@/core/modules";
import { MenuIcon } from "./menu-icons";

const OPEN_KEY = "menu-grupos-estado";
const OPEN_EVENT = "menu-grupos";
const subscribeOpen = (cb: () => void) => {
  window.addEventListener(OPEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(OPEN_EVENT, cb); window.removeEventListener("storage", cb); };
};
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) || "{}"; } catch { return "{}"; } };

/** `soft` es el color secundario de la marca: se usa para los títulos claros del menú en lugar del blanco. */
export function Sidebar({ modules, name, logoUrl, logoOnDark, soft }: { modules: ModuleDef[]; name: string; logoUrl?: string; logoOnDark?: boolean; soft: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Con el menú abierto en el celular no se desplaza la página de atrás.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Estado de cada grupo que la persona abrió o cerró (se recuerda en este navegador). Sin elección, solo está abierto el de la pantalla actual.
  const stateRaw = useSyncExternalStore(subscribeOpen, readOpen, () => "{}");
  const chosen: Record<string, boolean> = (() => { try { return JSON.parse(stateRaw); } catch { return {}; } })();
  const isActive = (m: ModuleDef) => (m.slug === "" ? pathname === "/" : pathname.startsWith(`/${m.slug}`));
  const activeGroup = modules.find(isActive)?.group;
  const isOpen = (g: string) => chosen[g] ?? g === activeGroup;
  function toggle(g: string) {
    const next = { ...chosen, [g]: !isOpen(g) };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event(OPEN_EVENT));
  }

  // Secciones en el orden del menú: ítems sueltos o grupos con título.
  const sections: { group?: string; items: ModuleDef[] }[] = [];
  for (const m of modules) {
    const last = sections[sections.length - 1];
    if (m.group && last?.group === m.group) last.items.push(m);
    else sections.push({ group: m.group, items: [m] });
  }

  const link = (m: ModuleDef, nested = false) => {
    const active = isActive(m);
    return (
      <Link
        key={m.slug}
        href={`/${m.slug}`}
        onClick={() => setOpen(false)}
        aria-label={m.label}
        style={{ color: soft }}
        className={`group/nav flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-all duration-200 ${m.logo ? "" : "gap-3 py-2"} ${nested ? "min-h-9" : ""} ${active ? "bg-white/10 ring-1 ring-white/10" : "opacity-75 hover:translate-x-0.5 hover:bg-white/[0.07] hover:opacity-100"}`}
      >
        {m.logo ? <img src={m.logo} alt={m.label} style={{ height: m.logoHeight ?? 24 }} className="block w-auto" /> : <><MenuIcon slug={m.slug} />{m.label}</>}
        {active && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgb(25_195_125/0.9)]" />}
      </Link>
    );
  };

  const nav = (
    <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-4 pt-4">
      {sections.map((sec, i) => {
        const prev = sections[i - 1];
        const first = sec.items[0];
        // Líneas finas: debajo de las plataformas (con logo) y antes de lo que va suelto al final (Configuración).
        const dividerBefore = !sec.group && Boolean(prev?.group);
        const dividerAfter = Boolean(first.logo) && !sections[i + 1]?.items[0]?.logo;
        if (!sec.group) {
          return (
            <div key={first.slug}>
              {dividerBefore && <div className="mx-3 my-3 h-px bg-white/10" aria-hidden />}
              {link(first)}
              {dividerAfter && <div className="mx-3 my-3 h-px bg-white/10" aria-hidden />}
            </div>
          );
        }
        const g = sec.group;
        const open = isOpen(g);
        const hasActive = g === activeGroup;
        return (
          <div key={g} className="pt-1.5">
            <button
              type="button"
              onClick={() => toggle(g)}
              aria-expanded={open}
              style={{ "--soft": soft } as React.CSSProperties}
              className={`group/head relative flex w-full items-center gap-2 overflow-hidden rounded-full px-4 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-[var(--soft)] transition-colors duration-300 before:absolute before:inset-0 before:origin-left before:scale-x-0 before:rounded-full before:bg-[#19c37d] before:transition-transform before:duration-300 before:ease-out hover:text-[#0f1115] hover:before:scale-x-100 ${open ? "bg-white/[0.06]" : ""}`}
            >
              <span aria-hidden className={`relative h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${hasActive ? "bg-accent shadow-[0_0_8px_rgb(25_195_125/0.9)] group-hover/head:bg-[#0f1115] group-hover/head:shadow-none" : "bg-white/25 group-hover/head:bg-[#0f1115]"}`} />
              <span className="relative">{g}</span>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`relative ml-auto h-4 w-4 transition-transform duration-300 ease-out ${open ? "" : "-rotate-90"}`} aria-hidden>
                <path d="m5 8 5 5 5-5" />
              </svg>
            </button>
            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div inert={!open} className="overflow-hidden">
                <div className="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-2">{sec.items.map((m) => link(m, true))}</div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[#0f1115] px-4 py-3 md:hidden" style={{ color: soft }}>
        {logoUrl && logoOnDark ? (
          <img src={logoUrl} alt={name} className="max-h-10 w-auto max-w-32 object-contain" />
        ) : logoUrl ? (
          <span className="flex items-center rounded-md bg-white px-2.5 py-1.5"><img src={logoUrl} alt={name} className="max-h-4 w-auto max-w-24 object-contain" /></span>
        ) : (
          <span className="truncate text-sm font-semibold">{name}</span>
        )}
        <button onClick={() => setOpen(!open)} aria-label="Menú" className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-white/10">☰</button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 h-dvh w-72 max-w-[85vw] flex-col bg-[#0f1115] shadow-2xl md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-60 md:max-w-none md:shrink-0 md:shadow-none`}>
        <div className="flex items-center justify-between px-3 pb-5 pt-4 md:justify-center md:pb-5 md:pt-6">
          {logoUrl && logoOnDark ? (
            <img src={logoUrl} alt={name} className="max-h-12 w-auto max-w-32 object-contain" />
          ) : logoUrl ? (
            <div className="flex w-fit max-w-full items-center rounded-md bg-white px-3 py-2">
              <img src={logoUrl} alt={name} className="max-h-4 w-auto max-w-32 object-contain" />
            </div>
          ) : (
            <p className="truncate px-3 text-sm font-semibold" style={{ color: soft }}>{name}</p>
          )}
          <button onClick={() => setOpen(false)} aria-label="Cerrar menú" style={{ color: soft }} className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-white/10 md:hidden">✕</button>
        </div>
        <div className="mx-3 h-px bg-white/10" aria-hidden />
        {nav}
        <div className="mx-3 h-px bg-white/10" aria-hidden />
        <div className="px-6 pb-1 pt-4 opacity-50 transition hover:opacity-100"><img src="/brand/carritix/carritix-logo-claro.svg" alt="Carritix" className="h-5 w-auto" /></div>
        <button onClick={logout} style={{ color: soft }} className="mx-3 mb-3 mt-1 flex items-center gap-2 rounded-full px-4 py-2 text-left text-sm opacity-75 transition hover:bg-white/[0.07] hover:opacity-100">
          Cerrar sesión
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
            <path d="M12.5 7 16 10l-3.5 3M16 10H8.5" />
          </svg>
        </button>
      </aside>
    </>
  );
}
