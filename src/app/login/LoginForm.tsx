"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CarritixLogo } from "@/components/brand/CarritixLogo";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

/** `vista` (solo en la demo): campos completados y "Ingresar" entra a la demostración, para presentar la pantalla. */
export function LoginForm({ vista }: { vista: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(vista ? "demo@minegocio.com" : "");
  const [password, setPassword] = useState(vista ? "demo1234" : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (vista) {
      router.push("/");
      return;
    }
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "No se pudo iniciar sesión.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0f1115] xl:relative">
      {/* Fondo negro completo: la imagen ocupa toda la pantalla (en el celular va debajo del logo), el logo arriba a la izquierda, el lema abajo y el casillero a la derecha. */}
      <div className="flex justify-center px-6 pb-3 pt-8 xl:absolute xl:left-12 xl:top-10 xl:z-10 xl:justify-start xl:p-0">
        <CarritixLogo onDark className="h-11 w-auto xl:h-14" />
      </div>
      <div className="relative aspect-[2000/1116] w-full overflow-hidden bg-[#0f1115] xl:absolute xl:inset-0 xl:aspect-auto">
        <img src="/login-portada.jpg" alt="" className="h-full w-full object-cover object-center" />
      </div>
      <div className="hidden xl:absolute xl:bottom-12 xl:left-12 xl:z-10 xl:block">
        <p className="text-[34px] font-semibold leading-[1.05] tracking-tight text-white">Escalá tus ventas<br />con orden.</p>
      </div>
      <div className="flex justify-center p-6 xl:absolute xl:inset-y-0 xl:right-0 xl:z-10 xl:w-full xl:items-center xl:justify-end xl:px-10 2xl:px-14">
        <form onSubmit={onSubmit} className="login-card w-full max-w-sm space-y-6 rounded-2xl border border-white/10 bg-[#0f1115]/85 p-8 text-white shadow-2xl backdrop-blur-md xl:max-w-[21rem] 2xl:max-w-[23rem]">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Ingresá a Carritix</h1>
            <p className="text-sm text-white/60">Tus ventas, stock y envíos en un solo lugar.</p>
          </div>
          <div className="space-y-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" inputMode="email" placeholder="tu@negocio.com" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </div>
          <Button type="submit" disabled={loading || !email || !password} className="w-full py-3 text-base">
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
          {error && <Alert tone="danger" title={error} />}
        </form>
      </div>
    </div>
  );
}
