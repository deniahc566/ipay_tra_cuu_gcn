import { getStore } from "@netlify/blobs";
import crypto from "crypto";
import type { AuditEvent, LoginSuccessEvent, LoginFailedEvent, LogoutEvent, LookupEvent, CancelEvent } from "@/types/audit";

// Distributive Omit so each union member loses "id" independently
type AppendableEvent =
  | Omit<LoginSuccessEvent, "id">
  | Omit<LoginFailedEvent, "id">
  | Omit<LogoutEvent, "id">
  | Omit<LookupEvent, "id">
  | Omit<CancelEvent, "id">;

export async function appendEvent(event: AppendableEvent): Promise<void> {
  const full = { ...event, id: crypto.randomUUID() } as AuditEvent;
  try {
    const store = getStore("audit");
    const isoKey = new Date(event.timestamp)
      .toISOString()
      .replace(/[:.]/g, "-");
    const key = `events/${isoKey}-${full.id}`;
    await store.setJSON(key, full);
  } catch {
    console.log("[audit]", JSON.stringify(full));
  }
}

export async function getRecentEvents(days = 7): Promise<AuditEvent[]> {
  try {
    const store = getStore("audit");
    const cutoff = Date.now() - days * 86_400_000;
    const { blobs } = await store.list({ prefix: "events/" });
    const events = (await Promise.all(
      blobs.map((b) => store.get(b.key, { type: "json" }) as Promise<AuditEvent>)
    )).filter((e): e is AuditEvent => !!e && e.timestamp >= cutoff);
    return events.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}
