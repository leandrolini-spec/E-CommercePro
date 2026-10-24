"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
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
    <div className="min-h-screen bg-black lg:relative">
      {/* Imagen de portada: en pantallas grandes ocupa toda la pantalla y el casillero va encima, a la derecha; en el celular va arriba, completa. */}
      <div className="relative aspect-[2000/1116] w-full overflow-hidden bg-black lg:absolute lg:inset-0 lg:aspect-auto">
        <img src="/login-portada.jpg" alt="E-commerce Pro" className="h-full w-full object-cover object-center" />
      </div>
      <div className="flex justify-center p-6 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:items-start lg:justify-end lg:px-5 lg:pt-5">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 shadow-xl lg:max-w-[22rem] lg:space-y-2 lg:px-3 lg:py-2.5 lg:[&_h1]:text-sm lg:[&_h1+p]:text-[11px] lg:[&_label]:text-[11px] lg:[&_input]:h-7 lg:[&_input]:px-2 lg:[&_input]:text-xs lg:[&_button]:h-7 lg:[&_button]:text-xs">
          <div>
            <h1 className="text-xl font-semibold">Gestión comercial</h1>
            <p className="text-sm text-muted">Ingresá la contraseña del equipo</p>
          </div>
          <div className="space-y-4 lg:flex lg:items-end lg:gap-3 lg:space-y-0">
            <div className="lg:flex-1">
              <Field label="Contraseña">
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
              </Field>
            </div>
            <Button type="submit" disabled={loading || !password} className="w-full lg:w-20 lg:px-2 lg:py-0">
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </div>
          {error && <Alert tone="danger" title={error} />}
        </form>
      </div>
    </div>
  );
}
