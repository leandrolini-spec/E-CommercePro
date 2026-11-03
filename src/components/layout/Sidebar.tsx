"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ModuleDef } from "@/core/modules";
import { MenuIcon } from "./menu-icons";

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

  const nav = (
    <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-4 pt-4">
      {modules.map((m, i) => {
        const href = `/${m.slug}`;
        // Línea fina que separa las plataformas (con logo) del resto del menú.
        const divider = Boolean(m.logo) && !modules[i + 1]?.logo;
        const active = m.slug === "" ? pathname === "/" : pathname.startsWith(href);
        return (
          <div key={m.slug}>
          <Link
            href={href}
            onClick={() => setOpen(false)}
            aria-label={m.label}
            style={{ color: soft }}
            className={`group/nav flex min-h-10 items-center rounded-full px-4 text-sm font-medium transition-all duration-200 ${m.logo ? "" : "gap-3 py-2"} ${active ? "bg-white/10 ring-1 ring-white/10" : "opacity-75 hover:translate-x-0.5 hover:bg-white/[0.07] hover:opacity-100"}`}
          >
            {m.logo ? <img src={m.logo} alt={m.label} style={{ height: m.logoHeight ?? 24 }} className="block w-auto" /> : <><MenuIcon slug={m.slug} />{m.label}</>}
            {active && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgb(25_195_125/0.9)]" />}
          </Link>
          {divider && <div className="mx-3 my-3 h-px bg-white/10" aria-hidden />}
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
