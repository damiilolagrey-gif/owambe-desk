"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Msg = { id: string; sender_id: string | null; kind: "text" | "system"; body: string; created_at: string };

export function Chat({ eventId, vendorId, me, initial }: { eventId: string; vendorId: string; me: string; initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const sb = useRef(supabaseBrowser()).current;

  useEffect(() => {
    const ch = sb.channel(`chat-${vendorId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `event_vendor_id=eq.${vendorId}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Msg).id) ? m : [...m, p.new as Msg])))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, vendorId]);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await sb.from("messages")
      .insert({ event_id: eventId, event_vendor_id: vendorId, sender_id: me, kind: "text", body })
      .select("id, sender_id, kind, body, created_at").single();
    if (error) { setError("Message not sent. Check your connection and try again."); setText(body); return; }
    setError("");
    setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data as Msg]));
  }

  return (
    <div className="card form">
      <div className="chat" ref={box}>
        {msgs.length ? msgs.map((m) => (
          <div key={m.id} className={`bub ${m.kind === "system" ? "sys" : m.sender_id === me ? "me" : ""}`}>
            {m.body}<small>{new Date(m.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</small>
          </div>
        )) : <div className="empty">No messages yet. Say hello.</div>}
      </div>
      {error && <div className="err">{error}</div>}
      <form className="compose" onSubmit={send}>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" autoComplete="off" aria-label="Message" />
        <button className="btn sm">Send</button>
      </form>
    </div>
  );
}
