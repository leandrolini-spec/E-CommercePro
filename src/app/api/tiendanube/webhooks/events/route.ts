import { after } from "next/server";
import { productDeleted, syncOne } from "@/integrations/tiendanube/sync";
import { tnSignatureOk } from "@/lib/tn-webhook";
import { service } from "@/modules/repo/supabase";

export const maxDuration = 60;

// Tienda Nube avisa cada pedido o producto nuevo/modificado. Se responde rápido y se procesa en segundo plano.
export async function POST(request: Request) {
  const body = await request.text();
  if (!tnSignatureOk(body, request.headers.get("x-linkedstore-hmac-sha256"))) return Response.json({ error: "Firma inválida." }, { status: 401 });
  const n = JSON.parse(body || "{}") as { store_id?: number | string; event?: string; id?: number | string };
  if (!n.store_id || !n.event || !n.id) return new Response(null, { status: 200 });
  const { data: acc } = await service().from("tn_accounts").select("project_id").eq("store_id", Number(n.store_id)).maybeSingle();
  if (!acc) return new Response(null, { status: 200 });
  const projectId = acc.project_id as string, id = String(n.id);
  after(async () => {
    try {
      if (n.event === "product/deleted") await productDeleted(projectId, id);
      else if (n.event!.startsWith("order/")) await syncOne(projectId, "order", id);
      else if (n.event!.startsWith("product/")) await syncOne(projectId, "product", id);
    } catch (e) {
      console.error(`[tiendanube] ${n.event} ${id}: ${(e as Error).message}`);
    }
  });
  return new Response(null, { status: 200 });
}
