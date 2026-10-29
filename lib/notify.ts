import { naira } from "./money";

// Optional WhatsApp alert through the WhatsApp Business Cloud API. The in-app chat message is the
// record; this is only a nudge, so failures are logged and never block a payment.
export async function whatsappPaymentAlert(phone: string | null, p: { vendor: string; label: string; amount: number; balance: number }) {
  const token = process.env.WHATSAPP_TOKEN;
  const numberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numberId || !phone) return;
  const to = phone.replace(/\D/g, "").replace(/^0/, "234");
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${numberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE || "payment_update",
          language: { code: "en" },
          components: [{ type: "body", parameters: [p.vendor, p.label, naira(p.amount), naira(p.balance)].map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    if (!res.ok) console.error("whatsapp alert failed", res.status, await res.text());
  } catch (e) {
    console.error("whatsapp alert failed", e);
  }
}
