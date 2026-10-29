import { NextResponse, type NextRequest } from "next/server";
import { validSignature } from "@/lib/paystack";
import { confirmPayment } from "@/lib/payments";

// Set this URL as the webhook in the Paystack dashboard: https://<your-domain>/api/paystack/webhook
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const event = JSON.parse(raw);
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      await confirmPayment(event.data.reference);
    } catch (e) {
      console.error("webhook confirm failed", event.data.reference, e);
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
