"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CarrixLogo } from "@/components/brand/CarrixLogo";
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
    <div className="min-h-screen bg-[#0f1115] lg:relative">
      {/* Imagen de portada: en pantallas grandes ocupa toda la pantalla y el casillero va encima, a la derecha; en el celular va debajo del logo, completa. */}
      <div className="flex justify-center px-6 pb-2 pt-8 lg:absolute lg:left-10 lg:top-9 lg:z-10 lg:justify-start lg:p-0">
        <CarrixLogo onDark className="h-11 w-auto lg:h-12" />
      </div>
      <div className="relative aspect-[2000/1116] w-full overflow-hidden bg-[#0f1115] lg:absolute lg:inset-0 lg:aspect-auto">
        <img src="/login-portada.jpg" alt="" className="h-full w-full object-cover object-center" />
      </div>
      <div className="flex justify-center p-6 lg:absolute lg:inset-y-0 lg:right-0 lg:z-10 lg:w-full lg:items-center lg:justify-end lg:px-12">
        <form onSubmit={onSubmit} className="login-card w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-[#0f1115]/85 p-7 text-white shadow-2xl backdrop-blur-md lg:max-w-[22rem]">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Ingresá a Carrix</h1>
            <p className="text-sm text-white/60">Tus ventas, stock y envíos en un solo lugar.</p>
          </div>
          <div className="space-y-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" inputMode="email" />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
          </div>
          <Button type="submit" disabled={loading || !email || !password} className="w-full py-2.5">
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
          {error && <Alert tone="danger" title={error} />}
        </form>
      </div>
    </div>
  );
}
