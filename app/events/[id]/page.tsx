import Link from "next/link";
import { redirect } from "next/navigation";
import { loadEvent, sums, dueSoon, vendorStatus, initials, siteUrl } from "@/lib/event";
import { naira, fmtDate } from "@/lib/money";
import { addVendor, inviteClient, decideApproval } from "@/app/actions";
import { EventTabs } from "./tabs";
import { CopyLink } from "@/components/copy-link";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, user, event, role, vendors } = await loadEvent(id);
  if (role === "vendor") {
    const mine = vendors.find((v) => v.vendor_user_id === user.id);
    redirect(mine ? `/events/${id}/vendors/${mine.id}` : "/dashboard");
  }
  const booked = vendors.reduce((a, v) => a + Number(v.total_kobo), 0);
  const paid = vendors.reduce((a, v) => a + sums(v).paid, 0);
  const soon = vendors.flatMap((v) => v.milestones.filter((m) => dueSoon(m)).map((m) => ({ v, m })))
    .sort((a, b) => (a.m.due_date ?? "").localeCompare(b.m.due_date ?? ""));
  const vendorIds = vendors.map((v) => v.vendor_user_id).filter(Boolean) as string[];
  const { data: banks } = role === "planner" && vendorIds.length
    ? await sb.from("bank_accounts").select("user_id").in("user_id", vendorIds) : { data: [] };
  const hasBank = new Set((banks ?? []).map((b) => b.user_id));
  const { data: approvals } = await sb.from("approvals").select("*").eq("event_id", id).eq("status", "pending");
  const { data: updates } = await sb.from("messages").select("body, created_at").eq("event_id", id).eq("kind", "system").order("created_at", { ascending: false }).limit(6);
  const { data: clientInvite } = role === "planner"
    ? await sb.from("invites").select("token").eq("event_id", id).eq("role", "client").is("used_by", null).limit(1).maybeSingle()
    : { data: null };
  const base = booked || 1;

  return (
    <>
      <div>
        <h1>{event.title}</h1>
        <div className="sub">{fmtDate(event.event_date)}{event.venue ? ` · ${event.venue}` : ""}{event.guests ? ` · ${event.guests} guests` : ""}</div>
      </div>
      <EventTabs id={id} role={role} current="overview" />
      <div className="hero">
        <div className="lbl">{role === "client" ? "Total booked for your event" : "Booked with vendors"}</div>
        <div className="big num">{naira(booked)}</div>
        <div className="bar"><i style={{ width: `${(paid / base) * 100}%`, background: "var(--good)" }} /></div>
        <div className="legend num">
          <div>Paid<b>{naira(paid)}</b></div>
          <div>Due in 30 days<b>{naira(soon.reduce((a, s) => a + Number(s.m.amount_kobo), 0))}</b></div>
          <div>Outstanding<b>{naira(booked - paid)}</b></div>
        </div>
      </div>

      {role === "client" && (approvals ?? []).map((a) => (
        <div className="card form" key={a.id} style={{ borderColor: "var(--gold)" }}>
          <div><span className="pill p-gold">Needs your approval</span></div>
          <div><b>{a.description}</b><div className="t2">Adds {naira(a.amount_kobo)} to the budget</div></div>
          <form action={decideApproval} className="btns">
            <input type="hidden" name="approval_id" value={a.id} /><input type="hidden" name="event_id" value={id} />
            <button className="btn sec" name="decision" value="decline">Decline</button>
            <button className="btn" name="decision" value="approve">Approve</button>
          </form>
        </div>
      ))}

      {role === "planner" && soon.length > 0 && (
        <>
          <h2>Coming up</h2>
          <div className="list">
            {soon.slice(0, 4).map(({ v, m }) => (
              <Link className="row" key={m.id} href={`/events/${id}/vendors/${v.id}`}>
                <div className="av">{initials(v.name)}</div>
                <div className="grow"><div className="t1">{v.name}</div><div className="t2">{m.label} · {fmtDate(m.due_date)}</div></div>
                <div className="right num"><b>{naira(m.amount_kobo)}</b></div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="sec-h"><h2>Vendors ({vendors.length})</h2></div>
      <div className="list">
        {vendors.length ? vendors.map((v) => {
          const s = sums(v);
          const [label, cls] = role === "planner" ? vendorStatus(v, hasBank.has(v.vendor_user_id ?? "")) : [s.out <= 0 && v.total_kobo > 0 ? "Fully paid" : "Booked", s.out <= 0 && v.total_kobo > 0 ? "p-good" : "p-mute"];
          const inner = (
            <>
              <div className="av">{initials(v.name)}</div>
              <div className="grow">
                <div className="t1">{v.name}</div><div className="t2">{v.category} · <span className="num">{naira(v.total_kobo)}</span></div>
                <div className="mini"><i style={{ width: `${(s.paid / (Number(v.total_kobo) || 1)) * 100}%` }} /></div>
              </div>
              <div className="right"><span className={`pill ${cls}`}>{label}</span><div className="t2 num" style={{ marginTop: 4 }}>{naira(s.out)} left</div></div>
            </>
          );
          return role === "planner"
            ? <Link className="row" key={v.id} href={`/events/${id}/vendors/${v.id}`}>{inner}</Link>
            : <div className="row" key={v.id}>{inner}</div>;
        }) : <div className="empty">No vendors yet.</div>}
      </div>

      {role === "planner" && (
        <>
          <details className="card" open={!vendors.length}>
            <summary>Add a vendor</summary>
            <form className="form" action={addVendor} style={{ marginTop: 12 }}>
              <input type="hidden" name="event_id" value={id} />
              <label className="f" htmlFor="name">Vendor or business name<input id="name" name="name" required placeholder="Kitchen 54 Catering" /></label>
              <div className="grid2">
                <label className="f" htmlFor="category">What they do
                  <select id="category" name="category">
                    {["Venue", "Food & drinks", "Decor", "Photo & video", "Makeup", "DJ & MC", "Cake", "Ushers & security", "Rentals", "Other"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="f" htmlFor="total">Agreed price (₦)<input id="total" name="total" inputMode="numeric" placeholder="4,200,000" /></label>
              </div>
              <label className="f" htmlFor="phone">Their WhatsApp number<input id="phone" name="phone" inputMode="tel" placeholder="0803 123 4567" /></label>
              <button className="btn">Add vendor</button>
            </form>
          </details>
          <div className="card form">
            <h2>Invite the couple or client</h2>
            <p className="sub" style={{ margin: 0 }}>They see vendors, balances and receipts, and approve budget changes. They never see bank details or your chats.</p>
            {clientInvite ? (
              <CopyLink url={`${siteUrl()}/join/${clientInvite.token}`} text={`You can follow the planning for ${event.title} here:`} />
            ) : (
              <form action={inviteClient}><input type="hidden" name="event_id" value={id} /><button className="btn sec">Create invite link</button></form>
            )}
          </div>
        </>
      )}

      <h2>Latest updates</h2>
      <div className="list">
        {(updates ?? []).length ? updates!.map((u, i) => (
          <div className="row" key={i}><div className="grow"><div>{u.body}</div><div className="t2">{new Date(u.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</div></div></div>
        )) : <div className="empty">Payments and agreements will show up here.</div>}
      </div>
    </>
  );
}
