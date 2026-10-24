import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/core/env";
import { ACCESS_COOKIE, REFRESH_COOKIE, authClient, cookieOptions } from "@/core/session";

const body = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la contraseña." }, { status: 400 });
  }

  let email: string;
  try {
    email = getEnv().APP_LOGIN_EMAIL;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data, error } = await authClient().auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  // 400 = credenciales inválidas. Un 401/403 o "API key" indica que la clave pública del servidor está mal cargada.
  if (error && (error.status === 401 || error.status === 403 || /api key|jwt/i.test(error.message))) {
    return NextResponse.json({ error: "El servidor no puede conectar con el sistema de acceso. Revisá SUPABASE_ANON_KEY y SUPABASE_URL." }, { status: 500 });
  }
  if (error || !data.session) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, data.session.access_token, cookieOptions);
  res.cookies.set(REFRESH_COOKIE, data.session.refresh_token, cookieOptions);
  return res;
}
