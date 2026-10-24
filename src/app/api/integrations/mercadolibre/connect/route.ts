import { NextResponse } from "next/server";
import { startAuthorization } from "@/integrations/mercadolibre/oauth";
import { publicBase } from "@/integrations/mercadolibre/base-url";
import { hasValidSession } from "@/core/session";
import { getDb } from "@/modules/data";
import { activeProjectId } from "@/modules/repo/supabase";

export async function GET(request: Request) {
  if (!(await hasValidSession())) return NextResponse.redirect(`${publicBase(request)}/login`);
  try {
    const db = await getDb();
    const url = await startAuthorization(await activeProjectId(), db.settings.mlSite);
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.redirect(`${publicBase(request)}/mercadolibre?error=${encodeURIComponent((e as Error).message)}`);
  }
}
