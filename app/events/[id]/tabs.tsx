import Link from "next/link";
import type { Role } from "@/lib/event";

export function EventTabs({ id, role, current }: { id: string; role: Role; current: "overview" | "expenses" }) {
  if (role === "vendor") return null;
  return (
    <nav className="tabs" aria-label="Event sections">
      <Link href={`/events/${id}`} aria-current={current === "overview" ? "page" : undefined}>Overview</Link>
      <Link href={`/events/${id}/expenses`} aria-current={current === "expenses" ? "page" : undefined}>Budget &amp; expenses</Link>
    </nav>
  );
}
