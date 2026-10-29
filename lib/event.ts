import { notFound, redirect } from "next/navigation";
import { requireUser } from "./supabase/server";

export type Milestone = { id: string; position: number; label: string; pct: number; amount_kobo: number; due_date: string | null; status: "unpaid" | "paid"; paid_at: string | null };
export type Vendor = { id: string; event_id: string; name: string; category: string; phone: string | null; total_kobo: number; vendor_user_id: string | null; terms_status: "none" | "sent" | "accepted"; milestones: Milestone[] };
export type Role = "planner" | "vendor" | "client";

export async function loadEvent(id: string) {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: event } = await sb.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();
  const { data: role } = await sb.rpc("event_role", { e: id });
  const { data: vendors } = await sb.from("event_vendors").select("*, milestones(*)").eq("event_id", id).order("created_at");
  const list = ((vendors ?? []) as Vendor[]).map((v) => ({ ...v, milestones: [...v.milestones].sort((a, b) => a.position - b.position) }));
  return { sb, user, event, role: role as Role, vendors: list };
}

export function sums(v: Vendor) {
  const paid = v.milestones.filter((m) => m.status === "paid").reduce((a, m) => a + Number(m.amount_kobo), 0);
  return { paid, out: Math.max(0, Number(v.total_kobo) - paid) };
}

export function dueSoon(m: Milestone, days = 30) {
  if (m.status === "paid" || !m.due_date) return false;
  return (new Date(m.due_date).getTime() - Date.now()) / 864e5 <= days;
}

export function vendorStatus(v: Vendor, hasBank: boolean): [string, string] {
  if (!v.vendor_user_id) return ["Not joined yet", "p-mute"];
  if (v.terms_status === "none") return ["No terms yet", "p-warn"];
  if (v.terms_status === "sent") return ["Waiting for vendor", "p-warn"];
  if (!hasBank) return ["No bank details", "p-bad"];
  const s = sums(v);
  if (s.out <= 0) return ["Fully paid", "p-good"];
  if (v.milestones.some((m) => dueSoon(m, 7))) return ["Payment due", "p-gold"];
  return ["On track", "p-mute"];
}

export const initials = (s: string) =>
  s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

export const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
