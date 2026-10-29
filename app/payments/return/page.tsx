import { redirect } from "next/navigation";
import { confirmPayment } from "@/lib/payments";
import { requireUser } from "@/lib/supabase/server";

// Paystack sends the planner back here. We confirm straight away so they don't wait for the webhook.
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const q = await searchParams;
  const reference = q.reference || q.trxref;
  if (!reference) redirect("/dashboard");
  let ok = false;
  try { ok = (await confirmPayment(reference)).ok; } catch (e) { console.error("confirm on return failed", e); }
  const { sb } = await requireUser();
  const { data: p } = await sb.from("payments").select("event_id, milestones(event_vendor_id)").eq("reference", reference).maybeSingle();
  const ms = p?.milestones as unknown as { event_vendor_id: string } | null;
  if (!p || !ms) redirect("/dashboard");
  redirect(`/events/${p.event_id}/vendors/${ms.event_vendor_id}?${ok ? "paid=1" : "error=" + encodeURIComponent("Paystack hasn't confirmed this payment yet. It will update here once it does.")}`);
}
