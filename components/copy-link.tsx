"use client";
import { useState } from "react";

// Shows an invite link with copy and WhatsApp share buttons.
export function CopyLink({ url, text, phone }: { url: string; text: string; phone?: string | null }) {
  const [copied, setCopied] = useState(false);
  const to = phone ? phone.replace(/\D/g, "").replace(/^0/, "234") : "";
  const wa = `https://wa.me/${to}?text=${encodeURIComponent(`${text} ${url}`)}`;
  return (
    <div className="form">
      <div className="copy">{url}</div>
      <div className="btns">
        <button type="button" className="btn sec sm" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => {})}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn sm" href={wa} target="_blank" rel="noreferrer">Send on WhatsApp</a>
      </div>
    </div>
  );
}
