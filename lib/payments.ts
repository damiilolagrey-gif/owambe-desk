import { createClient } from "@supabase/supabase-js";
import { verifyTransaction } from "./paystack";
import { whatsappPaymentAlert } from "./notify";

// Server-side client with no user session. Privileged work goes through server_* functions,
// which check SERVER_SECRET in the database.
export const serverDb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

export const secret = () => {
  const s = process.env.SERVER_SECRET;
  if (!s) throw new Error("SERVER_SECRET is not set");
  return s;
};

// Confirms with Paystack, then marks the milestone paid. Used by the webhook and the return page.
export async function confirmPayment(reference: string) {
  const tx = await verifyTransaction(reference);
  if (tx.status !== "success") return { ok: false as const, status: tx.status };
  const { data, error } = await serverDb().rpc("server_record_payment", { s: secret(), ref: reference, paid_amount: tx.amount });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (row?.recorded) {
    await whatsappPaymentAlert(row.vendor_phone, {
      vendor: row.vendor_name, label: row.label, amount: Number(row.amount_kobo), balance: Number(row.balance_kobo),
    });
  }
  return { ok: true as const, status: tx.status };
}
