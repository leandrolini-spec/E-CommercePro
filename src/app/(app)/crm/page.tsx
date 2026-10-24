import { redirect } from "next/navigation";

// La sección CRM ahora se llama Envíos.
export default function CrmRedirect() {
  redirect("/envios");
}
