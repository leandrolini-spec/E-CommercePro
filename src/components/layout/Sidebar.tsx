"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ModuleDef } from "@/core/modules";
import { MenuIcon } from "./menu-icons";

/** `soft` es el color secundario de la marca: se usa para los títulos claros del menú en lugar del blanco. */
export function Sidebar({ modules, name, logoUrl, soft }: { modules: ModuleDef[]; name: string; logoUrl?: string; soft: string }) {
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
    <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
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
            className={`flex min-h-9 items-center rounded-md px-3 text-sm font-medium ${m.logo ? "" : "gap-2.5 py-2"} ${active ? "bg-white/15" : "opacity-80 hover:bg-white/10 hover:opacity-100"}`}
          >
            {m.logo ? <img src={m.logo} alt={m.label} style={{ height: m.logoHeight ?? 24 }} className="block w-auto" /> : <><MenuIcon slug={m.slug} />{m.label}</>}
          </Link>
          {divider && <div className="mx-3 my-3 h-px bg-white/35" aria-hidden />}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[#0a0a0a] px-4 py-3 md:hidden" style={{ color: soft }}>
        {logoUrl ? (
          <span className="flex items-center rounded-md bg-white px-2.5 py-1.5"><img src={logoUrl} alt={name} className="max-h-4 w-auto max-w-24 object-contain" /></span>
        ) : (
          <span className="truncate text-sm font-semibold">{name}</span>
        )}
        <button onClick={() => setOpen(!open)} aria-label="Menú" className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-white/10">☰</button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`${open ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 h-dvh w-72 max-w-[85vw] flex-col bg-[#0a0a0a] shadow-2xl md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-60 md:max-w-none md:shrink-0 md:shadow-none`}>
        <div className="flex items-center justify-between px-3 pb-5 pt-4 md:block md:pb-8 md:pt-5">
          {logoUrl ? (
            <div className="flex w-fit max-w-full items-center rounded-md bg-white px-3 py-2">
              <img src={logoUrl} alt={name} className="max-h-4 w-auto max-w-32 object-contain" />
            </div>
          ) : (
            <p className="truncate px-3 text-sm font-semibold" style={{ color: soft }}>{name}</p>
          )}
          <button onClick={() => setOpen(false)} aria-label="Cerrar menú" style={{ color: soft }} className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-white/10 md:hidden">✕</button>
        </div>
        {nav}
        <div className="mx-3 h-px bg-white/35" aria-hidden />
        <button onClick={logout} style={{ color: soft }} className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm opacity-80 hover:bg-white/10 hover:opacity-100">
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
