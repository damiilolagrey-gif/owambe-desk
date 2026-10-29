import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { resolveAccount } from "@/lib/paystack";

export async function GET(req: NextRequest) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const account = req.nextUrl.searchParams.get("account") ?? "";
  const bank = req.nextUrl.searchParams.get("bank") ?? "";
  if (!/^\d{10}$/.test(account) || !bank) return NextResponse.json({ error: "Enter a 10-digit account number" }, { status: 400 });
  try {
    const { account_name } = await resolveAccount(account, bank);
    return NextResponse.json({ account_name });
  } catch {
    return NextResponse.json({ error: "We couldn't find this account. Check the number and bank." }, { status: 404 });
  }
}
