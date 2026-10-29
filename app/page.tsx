import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

export default async function Home() {
  const { user } = await requireUser();
  if (user) redirect("/dashboard");
  return (
    <>
      <h1 style={{ fontSize: 34, marginTop: 12 }}>Pay vendors, track every naira, and keep the couple in the loop.</h1>
      <p className="sub" style={{ fontSize: 16 }}>
        Owambe Desk puts the planner, the vendors and the client on one page for each event. Payments go straight into each
        vendor&apos;s verified bank account through Paystack, and everyone gets a receipt.
      </p>
      <div className="list">
        {[
          ["Verified bank names", "We check each vendor's account name with their bank before anyone pays."],
          ["Agreed payment terms", "Set 50/50 or any split. The vendor accepts it in the app."],
          ["A receipt for every payment", "Posted in the event chat with the Paystack reference."],
          ["Join from WhatsApp", "Vendors and clients open a link. No app to download."],
        ].map(([t, d]) => (
          <div className="row" key={t}><div className="grow"><div className="t1">{t}</div><div className="t2">{d}</div></div></div>
        ))}
      </div>
      <Link className="btn" href="/login">Get started</Link>
    </>
  );
}
