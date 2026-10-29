import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/supabase/server";
import { initializeTransaction } from "@/lib/paystack";
import { paystackFee } from "@/lib/money";
import { serverDb, secret } from "@/lib/payments";
import { siteUrl } from "@/lib/event";

export async function POST(req: NextRequest) {
  const { user } = await requireUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login", req.url), 303);
  const form = await req.formData();
  const milestoneId = String(form.get("milestone_id") ?? "");
  const db = serverDb();
  const { data, error } = await db.rpc("server_payment_context", { s: secret(), uid: user.id, m: milestoneId });
  const ctx = data?.[0];
  const back = (path: string, msg?: string) =>
    NextResponse.redirect(new URL(msg ? `${path}?error=${encodeURIComponent(msg)}` : path, req.url), 303);
  if (error || !ctx) return back("/dashboard", "That payment could not be found.");
  const vendorPath = `/events/${ctx.event_id}/vendors/${ctx.event_vendor_id}`;
  if (!ctx.is_planner) return back(vendorPath, "Only the planner can make payments.");
  if (ctx.status === "paid") return back(vendorPath, "This milestone is already paid.");
  if (ctx.terms_status !== "accepted") return back(vendorPath, "The vendor has to accept the terms first.");
  if (!ctx.subaccount_code) return back(vendorPath, "The vendor hasn't added verified bank details yet.");

  const amount = Number(ctx.amount_kobo);
  const fee = paystackFee(amount);
  const reference = `OD-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`.toUpperCase();
  try {
    const { error: e2 } = await db.rpc("server_create_payment", {
      s: secret(), uid: user.id, m: ctx.milestone_id, ev: ctx.event_id, ref: reference, amt: amount, fee,
    });
    if (e2) throw new Error(e2.message);
    const tx = await initializeTransaction({
      email: user.email, amount: amount + fee, reference, subaccount: ctx.subaccount_code,
      callback_url: `${siteUrl()}/payments/return`,
      metadata: { milestone_id: ctx.milestone_id, event_id: ctx.event_id, vendor: ctx.vendor_name, label: ctx.label },
    });
    return NextResponse.redirect(tx.authorization_url, 303);
  } catch (e) {
    return back(vendorPath, e instanceof Error ? e.message : "Paystack could not start the payment.");
  }
}
