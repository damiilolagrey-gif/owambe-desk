import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEvent, sums, dueSoon, initials, siteUrl } from "@/lib/event";
import { naira, fmtDate, paystackFee } from "@/lib/money";
import { setTerms, acceptTerms, sendInvoice } from "@/app/actions";
import { Chat } from "@/components/chat";
import { CopyLink } from "@/components/copy-link";

export default async function VendorPage({ params, searchParams }: {
  params: Promise<{ id: string; vid: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { id, vid } = await params;
  const q = await searchParams;
  const { sb, user, event, role, vendors } = await loadEvent(id);
  const v = vendors.find((x) => x.id === vid);
  if (!v) notFound();
  const isPlanner = role === "planner";
  const isVendor = v.vendor_user_id === user.id;
  const s = sums(v);

  const { data: bank } = v.vendor_user_id
    ? await sb.from("bank_accounts").select("bank_name, account_number, account_name").eq("user_id", v.vendor_user_id).maybeSingle()
    : { data: null };
  const { data: invoices } = await sb.from("invoices").select("*").eq("event_vendor_id", vid).order("created_at", { ascending: false });
  const { data: messages } = await sb.from("messages").select("id, sender_id, kind, body, created_at").eq("event_vendor_id", vid).order("created_at").limit(200);
  const { data: invite } = isPlanner && !v.vendor_user_id
    ? await sb.from("invites").select("token").eq("event_vendor_id", vid).is("used_by", null).limit(1).maybeSingle()
    : { data: null };
  const canPay = isPlanner && v.terms_status === "accepted" && !!bank;
  const nextUnpaid = v.milestones.find((m) => m.status === "unpaid");

  return (
    <>
      {isPlanner && <Link href={`/events/${id}`} style={{ fontWeight: 700 }}>‹ {event.title}</Link>}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div className="av" style={{ width: 48, height: 48, fontSize: 17 }}>{initials(v.name)}</div>
        <div className="grow"><h1 style={{ fontSize: 22 }}>{v.name}</h1><div className="sub">{v.category}{isVendor ? ` · ${event.title}` : ""}</div></div>
      </div>

      {q.paid && <div className="ok">Payment confirmed by Paystack. A receipt is in the chat below.</div>}
      {q.error && <div className="err">{q.error}</div>}

      {isPlanner && !v.vendor_user_id && (
        <div className="card form">
          <h2>Invite {v.name}</h2>
          <p className="sub" style={{ margin: 0 }}>Send this link on WhatsApp. They sign in, add their bank details and accept your terms.</p>
          {invite ? <CopyLink url={`${siteUrl()}/join/${invite.token}`} phone={v.phone} text={`Hi, please join ${event.title} on Owambe Desk so I can pay you directly:`} /> : <div className="sub">This vendor already has an invite.</div>}
        </div>
      )}
      {isVendor && !bank && <Link className="banner" href="/bank"><b>Add your bank details to get paid</b>We check the account name with your bank, so the planner knows it&apos;s really you.</Link>}
      {isPlanner && v.vendor_user_id && !bank && <div className="banner"><b>Waiting for bank details</b>{v.name} hasn&apos;t added a verified bank account yet.</div>}

      <div className="card">
        <dl className="kv num">
          <dt>Agreed price</dt><dd>{naira(v.total_kobo)}</dd>
          <dt>Paid</dt><dd style={{ color: "var(--good)" }}>{naira(s.paid)}</dd>
          <dt>Outstanding</dt><dd style={{ color: "var(--warn)" }}>{naira(s.out)}</dd>
          {(isPlanner || isVendor) && bank && <><dt>Pays into</dt><dd>{bank.account_name}<br /><span className="t2">{bank.bank_name} ••{bank.account_number.slice(-4)}</span> <span className="pill p-good">Verified</span></dd></>}
        </dl>
      </div>

      <div className="sec-h">
        <h2>Payment terms</h2>
        {v.terms_status === "accepted" && <span className="pill p-good">Agreed by both</span>}
        {v.terms_status === "sent" && <span className="pill p-warn">{isVendor ? "Needs your OK" : "Waiting for vendor"}</span>}
      </div>
      <div className="card">
        {v.milestones.length ? v.milestones.map((m, i) => {
          const fee = paystackFee(Number(m.amount_kobo));
          return (
            <div className="ms" key={m.id}>
              <div className={`step ${m.status === "paid" ? "done" : dueSoon(m, 7) ? "due" : ""}`}>{m.status === "paid" ? "✓" : i + 1}</div>
              <div className="grow"><div className="t1">{m.label} · {m.pct}%</div><div className="t2 num">{naira(m.amount_kobo)} · {m.status === "paid" ? `paid ${fmtDate(m.paid_at)}` : `due ${fmtDate(m.due_date)}`}</div></div>
              <div className="right">
                {m.status === "paid" ? <span className="pill p-good">Paid</span>
                  : canPay && m.id === nextUnpaid?.id ? (
                    <form action="/api/pay" method="post">
                      <input type="hidden" name="milestone_id" value={m.id} />
                      <button className="btn sm gold" title={`Includes Paystack fee of ${naira(fee)}`}>Pay {naira(Number(m.amount_kobo) + fee)}</button>
                    </form>
                  ) : <span className="pill p-mute">Unpaid</span>}
              </div>
            </div>
          );
        }) : <div className="empty">No payment terms yet.</div>}
        {canPay && nextUnpaid && <p className="t2" style={{ margin: "12px 0 0" }}>Paystack&apos;s fee is added to what you pay, so the vendor gets the full amount. Money goes straight to their bank account, usually by the next business day.</p>}
      </div>

      {isVendor && v.terms_status === "sent" && (
        <form action={acceptTerms} className="card form">
          <input type="hidden" name="vendor_id" value={vid} /><input type="hidden" name="event_id" value={id} />
          <p className="sub" style={{ margin: 0 }}>By accepting, you agree to the amounts and dates above. Each payment lands straight in your bank account and you get a receipt in the chat.</p>
          <button className="btn">Accept payment terms</button>
        </form>
      )}

      {isPlanner && !v.milestones.some((m) => m.status === "paid") && (
        <details className="card" open={v.terms_status === "none"}>
          <summary>{v.terms_status === "none" ? "Set payment terms" : "Change payment terms"}</summary>
          <form className="form" action={setTerms} style={{ marginTop: 12 }}>
            <input type="hidden" name="vendor_id" value={vid} /><input type="hidden" name="event_id" value={id} />
            <label className="f" htmlFor="total">Agreed price (₦)<input id="total" name="total" inputMode="numeric" defaultValue={v.total_kobo ? Number(v.total_kobo) / 100 : ""} required /></label>
            <div className="f">How will they be paid?
              <div className="chips">
                {[["50-50", "50 / 50"], ["70-30", "70 / 30"], ["50-30-20", "50 / 30 / 20"], ["100", "Full upfront"]].map(([val, lab], i) => (
                  <label className="chip" key={val}><input type="radio" name="split" value={val} defaultChecked={i === 0} /> {lab}</label>
                ))}
              </div>
            </div>
            <p className="t2" style={{ margin: 0 }}>The deposit is due now. Balances are due a week before the event date. The vendor must accept before you can pay.</p>
            <button className="btn">Send terms to {v.name}</button>
          </form>
        </details>
      )}

      <div className="sec-h"><h2>Invoices</h2></div>
      <div className="list">
        {(invoices ?? []).length ? invoices!.map((inv) => (
          <div className="row" key={inv.id}><div className="grow"><div className="t1">{inv.number}</div><div className="t2">{inv.note || "Invoice"} · {fmtDate(inv.created_at)}</div></div><div className="right num"><b>{naira(inv.amount_kobo)}</b></div></div>
        )) : <div className="empty">No invoices yet.</div>}
      </div>
      {(isVendor || isPlanner) && (
        <details className="card">
          <summary>{isVendor ? "Send an invoice" : "Record an invoice"}</summary>
          <form className="form" action={sendInvoice} style={{ marginTop: 12 }}>
            <input type="hidden" name="vendor_id" value={vid} /><input type="hidden" name="event_id" value={id} />
            <label className="f" htmlFor="amount">Amount (₦)<input id="amount" name="amount" inputMode="numeric" defaultValue={Number(v.total_kobo) / 100 || ""} required /></label>
            <label className="f" htmlFor="note">What it covers<input id="note" name="note" placeholder="DJ, MC and sound for 12 Dec" /></label>
            <button className="btn">Send to planner and client</button>
          </form>
        </details>
      )}

      {(isVendor || isPlanner) && (
        <>
          <h2>Chat</h2>
          <Chat eventId={id} vendorId={vid} me={user.id} initial={messages ?? []} />
        </>
      )}
    </>
  );
}
