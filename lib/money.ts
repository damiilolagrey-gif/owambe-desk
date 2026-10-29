// All amounts are kobo (₦1 = 100 kobo) until they are shown.
export const naira = (kobo: number) => "₦" + Math.round(kobo / 100).toLocaleString("en-NG");

export const toKobo = (input: FormDataEntryValue | null) => {
  const n = Number(String(input ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// Paystack Nigeria local fee: 1.5% + ₦100 (₦100 waived under ₦2,500), capped at ₦2,000.
export const paystackFee = (kobo: number) =>
  Math.min(200_000, Math.round(kobo * 0.015) + (kobo < 250_000 ? 0 : 10_000));

export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "No date";
