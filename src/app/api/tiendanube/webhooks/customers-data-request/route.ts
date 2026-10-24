import { handlePrivacyWebhook } from "@/lib/tn-webhook";

export async function POST(request: Request) {
  return handlePrivacyWebhook(request, "customers-data-request");
}
