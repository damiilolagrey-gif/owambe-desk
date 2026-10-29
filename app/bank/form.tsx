"use client";
import { useActionState, useState } from "react";
import { saveBank, type BankState } from "@/app/actions";
import type { Bank } from "@/lib/paystack";

export function BankForm({ banks, replacing }: { banks: Bank[]; replacing: boolean }) {
  const [state, action, pending] = useActionState<BankState, FormData>(saveBank, {});
  const [bank, setBank] = useState("");
  const [acct, setAcct] = useState("");
  const [name, setName] = useState<{ ok: boolean; text: string } | null>(null);

  async function check(nextAcct: string, nextBank: string) {
    setName(null);
    if (nextAcct.length !== 10 || !nextBank) return;
    setName({ ok: true, text: "Checking with your bank…" });
    const r = await fetch(`/api/resolve?account=${nextAcct}&bank=${nextBank}`).then((x) => x.json()).catch(() => ({ error: "Could not check right now." }));
    setName(r.account_name ? { ok: true, text: `✓ ${r.account_name}` } : { ok: false, text: r.error || "We couldn't find this account." });
  }

  if (state.saved) return <div className="ok">Saved. Planners can now pay {state.saved} directly.</div>;
  return (
    <form className="form card" action={action}>
      {replacing && <b>Change account</b>}
      <label className="f" htmlFor="bank_code">Bank
        <select id="bank_code" name="bank_code" required value={bank} onChange={(e) => { setBank(e.target.value); check(acct, e.target.value); }}>
          <option value="">Choose your bank</option>
          {banks.map((b) => <option key={b.code + b.name} value={b.code}>{b.name}</option>)}
        </select>
      </label>
      <label className="f" htmlFor="account_number">Account number
        <input id="account_number" name="account_number" inputMode="numeric" maxLength={10} required value={acct} placeholder="10 digits"
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 10); setAcct(v); check(v, bank); }} />
      </label>
      {name && <div className={name.ok ? "ok" : "err"}>{name.text}</div>}
      {state.error && <div className="err">{state.error}</div>}
      <button className="btn" disabled={pending || !name?.text.startsWith("✓")}>{pending ? "Saving…" : "Save bank details"}</button>
    </form>
  );
}
