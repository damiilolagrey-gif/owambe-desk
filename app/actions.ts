"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { toKobo } from "@/lib/money";
import { createSubaccount, resolveAccount, listBanks } from "@/lib/paystack";
import { serverDb, secret } from "@/lib/payments";

async function authed() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  return { sb, user };
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (msg: string): never => { throw new Error(msg); };

export async function signOut() {
  const { sb } = await requireUser();
  await sb.auth.signOut();
  redirect("/");
}

export async function saveProfile(f: FormData) {
  const { sb, user } = await authed();
  const { error } = await sb.from("profiles").update({ full_name: str(f, "full_name"), phone: str(f, "phone") || null }).eq("id", user.id);
  if (error) fail(error.message);
  revalidatePath("/dashboard");
}

export async function createEvent(f: FormData) {
  const { sb, user } = await authed();
  const { data, error } = await sb.from("events").insert({
    planner_id: user.id,
    title: str(f, "title"),
    event_date: str(f, "event_date") || null,
    venue: str(f, "venue") || null,
    guests: Number(str(f, "guests")) || null,
    budget_kobo: toKobo(f.get("budget")),
  }).select("id").single();
  if (error) fail(error.message);
  redirect(`/events/${data!.id}`);
}

export async function addVendor(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const { data: v, error } = await sb.from("event_vendors").insert({
    event_id: eventId,
    name: str(f, "name"),
    category: str(f, "category") || "Other",
    phone: str(f, "phone") || null,
    total_kobo: toKobo(f.get("total")),
  }).select("id").single();
  if (error) fail(error.message);
  const { error: e2 } = await sb.from("invites").insert({ event_id: eventId, role: "vendor", event_vendor_id: v!.id });
  if (e2) fail(e2.message);
  redirect(`/events/${eventId}/vendors/${v!.id}`);
}

export async function inviteClient(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const { error } = await sb.from("invites").insert({ event_id: eventId, role: "client" });
  if (error) fail(error.message);
  revalidatePath(`/events/${eventId}`);
}

const SPLITS: Record<string, { pct: number; label: string; offsetDays: number | null }[]> = {
  "50-50": [{ pct: 50, label: "Deposit on booking", offsetDays: null }, { pct: 50, label: "Balance, 1 week before", offsetDays: -7 }],
  "70-30": [{ pct: 70, label: "Deposit on booking", offsetDays: null }, { pct: 30, label: "Balance, 1 week before", offsetDays: -7 }],
  "50-30-20": [
    { pct: 50, label: "Deposit on booking", offsetDays: null },
    { pct: 30, label: "Before the event", offsetDays: -7 },
    { pct: 20, label: "After the event", offsetDays: 2 },
  ],
  "100": [{ pct: 100, label: "Full payment", offsetDays: null }],
};

export async function setTerms(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const vendorId = str(f, "vendor_id");
  const total = toKobo(f.get("total"));
  const split = SPLITS[str(f, "split")] ?? SPLITS["50-50"];
  if (total <= 0) fail("Enter the agreed price");
  const { data: ev } = await sb.from("events").select("event_date").eq("id", eventId).single();
  const eventDate = ev?.event_date ? new Date(ev.event_date) : null;
  const today = new Date().toISOString().slice(0, 10);
  let left = total;
  const rows = split.map((s, i) => {
    const amount = i === split.length - 1 ? left : Math.round((total * s.pct) / 100);
    left -= amount;
    const due = s.offsetDays === null || !eventDate
      ? today
      : new Date(eventDate.getTime() + s.offsetDays * 864e5).toISOString().slice(0, 10);
    return { event_vendor_id: vendorId, position: i + 1, label: s.label, pct: s.pct, amount_kobo: amount, due_date: due };
  });
  await sb.from("milestones").delete().eq("event_vendor_id", vendorId).eq("status", "unpaid");
  const { error } = await sb.from("milestones").insert(rows);
  if (error) fail(error.message);
  await sb.from("event_vendors").update({ total_kobo: total, terms_status: "sent" }).eq("id", vendorId);
  await sb.from("messages").insert({
    event_id: eventId, event_vendor_id: vendorId, kind: "system",
    body: `Payment terms shared: ${split.map((s) => `${s.pct}% ${s.label.toLowerCase()}`).join(", ")}. Waiting for the vendor to accept.`,
  });
  revalidatePath(`/events/${eventId}/vendors/${vendorId}`);
}

export async function acceptTerms(f: FormData) {
  const { sb } = await authed();
  const { error } = await sb.rpc("accept_terms", { ev: str(f, "vendor_id") });
  if (error) fail(error.message);
  revalidatePath(`/events/${str(f, "event_id")}/vendors/${str(f, "vendor_id")}`);
}

export async function sendInvoice(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const vendorId = str(f, "vendor_id");
  const { count } = await sb.from("invoices").select("id", { count: "exact", head: true }).eq("event_vendor_id", vendorId);
  const { error } = await sb.from("invoices").insert({
    event_id: eventId, event_vendor_id: vendorId,
    number: "INV-" + String((count ?? 0) + 1).padStart(3, "0"),
    amount_kobo: toKobo(f.get("amount")), note: str(f, "note") || null,
  });
  if (error) fail(error.message);
  revalidatePath(`/events/${eventId}/vendors/${vendorId}`);
}

export async function addExpense(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const { error } = await sb.from("expenses").insert({
    event_id: eventId, description: str(f, "description"), amount_kobo: toKobo(f.get("amount")),
    category: str(f, "category") || "Other", paid_with: str(f, "paid_with") || "Cash",
  });
  if (error) fail(error.message);
  revalidatePath(`/events/${eventId}/expenses`);
}

export async function requestApproval(f: FormData) {
  const { sb } = await authed();
  const eventId = str(f, "event_id");
  const { error } = await sb.from("approvals").insert({
    event_id: eventId, description: str(f, "description"), amount_kobo: toKobo(f.get("amount")),
  });
  if (error) fail(error.message);
  revalidatePath(`/events/${eventId}/expenses`);
}

export async function decideApproval(f: FormData) {
  const { sb } = await authed();
  const { error } = await sb.rpc("decide_approval", { a: str(f, "approval_id"), approve: str(f, "decision") === "approve" });
  if (error) fail(error.message);
  revalidatePath(`/events/${str(f, "event_id")}`);
}

export type BankState = { error?: string; saved?: string };

export async function saveBank(_: BankState, f: FormData): Promise<BankState> {
  const { user } = await authed();
  const account = str(f, "account_number").replace(/\D/g, "");
  const bankCode = str(f, "bank_code");
  if (account.length !== 10) return { error: "Account number must be 10 digits." };
  try {
    const bank = (await listBanks()).find((b) => b.code === bankCode);
    if (!bank) return { error: "Choose your bank from the list." };
    // Always re-check on the server: the name shown to planners comes from the bank, not the form.
    const { account_name } = await resolveAccount(account, bankCode);
    const { subaccount_code } = await createSubaccount(account_name, bankCode, account);
    const { error } = await serverDb().rpc("server_save_bank", {
      s: secret(), uid: user.id, p_bank_code: bankCode, p_bank_name: bank.name,
      p_account_number: account, p_account_name: account_name, p_subaccount: subaccount_code,
    });
    if (error) return { error: error.message };
    revalidatePath("/bank");
    return { saved: account_name };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not check this account. Try again." };
  }
}
