import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/money";
import { createEvent, saveProfile } from "../actions";

const ROLE_LABEL = { planner: "You're planning", vendor: "You're a vendor", client: "Your event" } as const;

export default async function Dashboard() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("full_name, phone").eq("id", user.id).single();
  const { data: rows } = await sb.from("event_members").select("role, events(id, title, event_date, venue)").eq("user_id", user.id);
  type Row = { role: keyof typeof ROLE_LABEL; events: { id: string; title: string; event_date: string | null; venue: string | null } | null };
  const events = ((rows ?? []) as unknown as Row[]).filter((r) => r.events)
    .sort((a, b) => (a.events!.event_date ?? "9").localeCompare(b.events!.event_date ?? "9"));
  const isVendor = events.some((e) => e.role === "vendor");

  if (!profile?.full_name) {
    return (
      <>
        <h1>Welcome</h1>
        <form className="form card" action={saveProfile}>
          <label className="f" htmlFor="full_name">Your name or business name
            <input id="full_name" name="full_name" required placeholder="e.g. Bisola Events" />
          </label>
          <label className="f" htmlFor="phone">WhatsApp number
            <input id="phone" name="phone" inputMode="tel" placeholder="0803 123 4567" defaultValue={profile?.phone ?? ""} />
          </label>
          <button className="btn">Continue</button>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>Hello, {profile.full_name.split(" ")[0]}</h1>
      {isVendor && <Link className="banner" href="/bank"><b>Your bank details</b>Add or check the account planners pay into.</Link>}
      <div className="sec-h"><h2>Your events</h2></div>
      <div className="list">
        {events.length ? events.map(({ role, events: e }) => (
          <Link className="row" key={e!.id} href={`/events/${e!.id}`}>
            <div className="grow"><div className="t1">{e!.title}</div><div className="t2">{fmtDate(e!.event_date)}{e!.venue ? ` · ${e!.venue}` : ""}</div></div>
            <span className="pill p-mute">{ROLE_LABEL[role]}</span>
          </Link>
        )) : <div className="empty">No events yet. Create one below, or open an invite link from a planner.</div>}
      </div>
      <details className="card" open={!events.length}>
        <summary>Plan a new event</summary>
        <form className="form" action={createEvent} style={{ marginTop: 12 }}>
          <label className="f" htmlFor="title">Event name<input id="title" name="title" required placeholder="Tolu & Femi's Wedding" /></label>
          <div className="grid2">
            <label className="f" htmlFor="event_date">Date<input id="event_date" name="event_date" type="date" /></label>
            <label className="f" htmlFor="guests">Guests<input id="guests" name="guests" inputMode="numeric" placeholder="450" /></label>
          </div>
          <label className="f" htmlFor="venue">Venue or area<input id="venue" name="venue" placeholder="Lekki, Lagos" /></label>
          <label className="f" htmlFor="budget">Total budget (₦)<input id="budget" name="budget" inputMode="numeric" placeholder="18,500,000" /></label>
          <button className="btn">Create event</button>
        </form>
      </details>
    </>
  );
}
