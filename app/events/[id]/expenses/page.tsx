import { notFound } from "next/navigation";
import { loadEvent } from "@/lib/event";
import { naira, fmtDate } from "@/lib/money";
import { addExpense, requestApproval } from "@/app/actions";
import { EventTabs } from "../tabs";

export default async function Expenses({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, event, role, vendors } = await loadEvent(id);
  if (role === "vendor") notFound();
  const { data: expenses } = await sb.from("expenses").select("*").eq("event_id", id).order("spent_on", { ascending: false });
  const { data: approvals } = await sb.from("approvals").select("*").eq("event_id", id).order("created_at", { ascending: false });
  const cats = new Map<string, number>();
  vendors.forEach((v) => cats.set(v.category, (cats.get(v.category) ?? 0) + Number(v.total_kobo)));
  (expenses ?? []).forEach((e) => cats.set(e.category, (cats.get(e.category) ?? 0) + Number(e.amount_kobo)));
  const committed = [...cats.values()].reduce((a, b) => a + b, 0);
  const budget = Number(event.budget_kobo);
  const max = Math.max(1, ...cats.values());

  return (
    <>
      <h1>{event.title}</h1>
      <EventTabs id={id} role={role} current="expenses" />
      <div className="hero">
        <div className="lbl">Budget</div>
        <div className="big num">{naira(budget)}</div>
        <div className="bar"><i style={{ width: `${Math.min(100, (committed / (budget || 1)) * 100)}%`, background: "var(--brand)" }} /></div>
        <div className="legend num" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>Committed<b>{naira(committed)}</b></div>
          <div>Left to plan with<b style={{ color: budget - committed < 0 ? "var(--bad)" : "var(--good)" }}>{naira(budget - committed)}</b></div>
        </div>
      </div>
      <h2>By category</h2>
      <div className="card form">
        {[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, a]) => (
          <div key={k}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}><span>{k}</span><b className="num">{naira(a)}</b></div>
            <div className="mini" style={{ height: 7 }}><i style={{ width: `${(a / max) * 100}%`, background: "var(--brand)" }} /></div>
          </div>
        ))}
        {!cats.size && <div className="empty">Add vendors or expenses to see where the money goes.</div>}
      </div>

      <h2>Small expenses</h2>
      <div className="list">
        {(expenses ?? []).length ? expenses!.map((e) => (
          <div className="row" key={e.id}><div className="grow"><div className="t1">{e.description}</div><div className="t2">{e.category} · {e.paid_with} · {fmtDate(e.spent_on)}</div></div><div className="right num"><b>{naira(e.amount_kobo)}</b></div></div>
        )) : <div className="empty">Transport, courier, tasting sessions and other small costs go here.</div>}
      </div>
      {role === "planner" && (
        <details className="card">
          <summary>Add an expense</summary>
          <form className="form" action={addExpense} style={{ marginTop: 12 }}>
            <input type="hidden" name="event_id" value={id} />
            <label className="f" htmlFor="description">What was it for?<input id="description" name="description" required placeholder="Fuel for decor van" /></label>
            <div className="grid2">
              <label className="f" htmlFor="amount">Amount (₦)<input id="amount" name="amount" inputMode="numeric" required placeholder="25,000" /></label>
              <label className="f" htmlFor="paid_with">Paid with<select id="paid_with" name="paid_with"><option>Cash</option><option>Transfer</option><option>Card</option></select></label>
            </div>
            <label className="f" htmlFor="category">Category<select id="category" name="category"><option>Logistics</option><option>Food &amp; drinks</option><option>Decor</option><option>Souvenirs</option><option>Other</option></select></label>
            <button className="btn">Save expense</button>
          </form>
        </details>
      )}

      <h2>Budget changes</h2>
      <div className="list">
        {(approvals ?? []).length ? approvals!.map((a) => (
          <div className="row" key={a.id}><div className="grow"><div className="t1">{a.description}</div><div className="t2 num">{naira(a.amount_kobo)}</div></div>
            <span className={`pill ${a.status === "approved" ? "p-good" : a.status === "declined" ? "p-bad" : "p-gold"}`}>{a.status === "pending" ? "Waiting for client" : a.status === "approved" ? "Approved" : "Declined"}</span></div>
        )) : <div className="empty">Nothing requested yet.</div>}
      </div>
      {role === "planner" && (
        <details className="card">
          <summary>Ask the client to approve extra spend</summary>
          <form className="form" action={requestApproval} style={{ marginTop: 12 }}>
            <input type="hidden" name="event_id" value={id} />
            <label className="f" htmlFor="a-description">What is it for?<input id="a-description" name="description" required placeholder="Extra uplighting and LED dance floor" /></label>
            <label className="f" htmlFor="a-amount">Extra amount (₦)<input id="a-amount" name="amount" inputMode="numeric" required placeholder="350,000" /></label>
            <button className="btn">Send for approval</button>
          </form>
        </details>
      )}
    </>
  );
}
