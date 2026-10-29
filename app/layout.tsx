import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Owambe Desk",
  description: "Pay vendors, track balances and share receipts for every event, in one place.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0F4A37" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <header className="top">
          <div className="top-in">
            <Link href={user ? "/dashboard" : "/"} className="brand">Owambe Desk</Link>
            {user && (
              <form action={signOut}><button type="submit">Sign out</button></form>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
