"use client";

import { useRouter } from "next/navigation";
import { Button, ErrorState } from "@/components/ui/primitives";

/** Se muestra cuando la cuenta tiene sesión pero ninguna empresa asignada. Permite salir para entrar con otra cuenta. */
export function NoCompany({ message }: { message: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <ErrorState title="Sin empresa asignada" description={message} action={<Button onClick={logout}>Cerrar sesión</Button>} />
      </div>
    </div>
  );
}
