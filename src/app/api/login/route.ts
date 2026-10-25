import { NextResponse } from "next/server";
import { z } from "zod";
import { membershipOf } from "@/core/membership";
import { ACCESS_COOKIE, REFRESH_COOKIE, authClient, cookieOptions } from "@/core/session";

const body = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresá tu email y tu contraseña." }, { status: 400 });
  }

  let auth;
  try {
    auth = authClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data, error } = await auth.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  // 400 = credenciales inválidas. Un 401/403 o "API key" indica que la clave pública del servidor está mal cargada.
  if (error && (error.status === 401 || error.status === 403 || /api key|jwt/i.test(error.message))) {
    return NextResponse.json({ error: "El servidor no puede conectar con el sistema de acceso. Revisá SUPABASE_ANON_KEY y SUPABASE_URL." }, { status: 500 });
  }
  // Mismo mensaje para email desconocido y contraseña errónea: no se revela cuál de los dos falló.
  if (error || !data.session) {
    return NextResponse.json({ error: "Email o contraseña incorrectos." }, { status: 401 });
  }

  // Sin empresa asignada no se abre sesión: así nunca queda en un ir y venir con el login.
  let company;
  try {
    company = await membershipOf(data.user.id);
  } catch {
    return NextResponse.json({ error: "No se pudo comprobar tu empresa. Probá de nuevo en un momento." }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "Tu cuenta no tiene una empresa asignada. Pedile acceso a quien administra el sistema." }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, data.session.access_token, cookieOptions);
  res.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions);
  return res;
}
