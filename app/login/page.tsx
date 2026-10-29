"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function Login() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setError(error.message); setState("idle"); } else setState("sent");
  }

  return (
    <>
      <h1>Sign in</h1>
      {state === "sent" ? (
        <div className="card">
          <b>Check your email.</b>
          <p className="sub">We sent a sign-in link to {email}. Open it on this phone to continue.</p>
        </div>
      ) : (
        <form className="form card" onSubmit={send}>
          <label className="f" htmlFor="email">Email address
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </label>
          {error && <div className="err">{error}</div>}
          <button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send me a sign-in link"}</button>
          <p className="sub" style={{ margin: 0 }}>No password needed. New here? The same link creates your account.</p>
        </form>
      )}
    </>
  );
}

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}
