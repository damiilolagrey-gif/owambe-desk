import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export default async function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { sb, user } = await requireUser();
  if (!user) redirect(`/login?next=/join/${token}`);
  const { data, error } = await sb.rpc("accept_invite", { t: token });
  if (error || !data?.[0]) {
    return (
      <div className="card form">
        <h1>This link didn&apos;t work</h1>
        <p className="sub">{error?.message ?? "The invite could not be found."} Ask the planner to send a new link.</p>
        <Link className="btn sec" href="/dashboard">Go to my events</Link>
      </div>
    );
  }
  const { event_id, event_vendor_id } = data[0];
  const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).single();
  if (!profile?.full_name) redirect("/dashboard");
  redirect(event_vendor_id ? `/events/${event_id}/vendors/${event_vendor_id}` : `/events/${event_id}`);
}
