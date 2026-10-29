import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Payments are not set up yet. Add PAYSTACK_SECRET_KEY.");
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status === false) throw new Error(body.message || `Paystack error ${res.status}`);
  return body.data as T;
}

export type Bank = { name: string; code: string };

export const listBanks = () =>
  call<Bank[]>("/bank?country=nigeria&perPage=200").then((b) =>
    b.map(({ name, code }) => ({ name, code })).sort((a, z) => a.name.localeCompare(z.name)),
  );

export const resolveAccount = (account: string, bankCode: string) =>
  call<{ account_name: string }>(`/bank/resolve?account_number=${account}&bank_code=${bankCode}`);

// The vendor's money settles straight to this subaccount's bank account. We take no cut.
export const createSubaccount = (name: string, bankCode: string, account: string) =>
  call<{ subaccount_code: string }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({ business_name: name, settlement_bank: bankCode, account_number: account, percentage_charge: 0 }),
  });

export const initializeTransaction = (p: {
  email: string; amount: number; reference: string; subaccount: string; callback_url: string; metadata: object;
}) =>
  call<{ authorization_url: string }>("/transaction/initialize", {
    method: "POST",
    // bearer "subaccount": the planner pays amount + fee, Paystack's fee comes out of that, the vendor gets the amount.
    body: JSON.stringify({ ...p, bearer: "subaccount", channels: ["bank_transfer", "card", "ussd", "bank"] }),
  });

export const verifyTransaction = (reference: string) =>
  call<{ status: string; amount: number; reference: string }>(`/transaction/verify/${encodeURIComponent(reference)}`);

export function validSignature(raw: string, signature: string | null) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(raw).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
