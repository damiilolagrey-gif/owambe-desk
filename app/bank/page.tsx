import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { listBanks, type Bank } from "@/lib/paystack";
import { BankForm } from "./form";

export default async function BankPage() {
  const { sb, user } = await requireUser();
  if (!user) redirect("/login");
  const { data: bank } = await sb.from("bank_accounts").select("bank_name, account_number, account_name").eq("user_id", user.id).maybeSingle();
  let banks: Bank[] = [];
  let loadError = "";
  try { banks = await listBanks(); } catch (e) { loadError = e instanceof Error ? e.message : "Could not load banks."; }
  return (
    <>
      <h1>Where should planners pay you?</h1>
      <p className="sub" style={{ margin: 0 }}>Use an account in your business or own name. We confirm the name with your bank through Paystack before anyone can pay you.</p>
      {bank && (
        <div className="card">
          <dl className="kv"><dt>Bank</dt><dd>{bank.bank_name}</dd><dt>Account</dt><dd className="num">{bank.account_number}</dd><dt>Name</dt><dd>{bank.account_name}</dd></dl>
          <div className="ok" style={{ marginTop: 10 }}>Verified. Payments go straight into this account.</div>
        </div>
      )}
      {loadError ? <div className="err">{loadError}</div> : <BankForm banks={banks} replacing={!!bank} />}
    </>
  );
}
