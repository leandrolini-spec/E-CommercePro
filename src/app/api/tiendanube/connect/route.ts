import { NextResponse } from "next/server";
import { publicBase } from "@/integrations/mercadolibre/base-url";
import { startAuthorization } from "@/integrations/tiendanube/oauth";
import { hasValidSession } from "@/core/session";
import { activeProjectId } from "@/modules/repo/supabase";

export async function GET(request: Request) {
  if (!(await hasValidSession())) return NextResponse.redirect(`${publicBase(request)}/login`);
  try {
    return NextResponse.redirect(await startAuthorization(await activeProjectId()));
  } catch (e) {
    return NextResponse.redirect(`${publicBase(request)}/tiendanube?error=${encodeURIComponent((e as Error).message)}`);
  }
}
