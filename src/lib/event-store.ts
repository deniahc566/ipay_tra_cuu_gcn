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

export async function getRecentEvents(opts?: {
  from?: number; // ms timestamp, default: now - 7 days
  to?: number;   // ms timestamp, default: now
}): Promise<AuditEvent[]> {
  try {
    const now = Date.now();
    const from = opts?.from ?? now - 7 * 86_400_000;
    const to = opts?.to ?? now;
    const store = getStore("audit");
    const { blobs } = await store.list({ prefix: "events/" });
    // Keys have the form events/${isoDate}-${uuid} where ':' and '.' → '-'.
    // Because ISO dates sort lexicographically, we can pre-filter by key bounds
    // to avoid fetching every blob individually (each is a separate HTTP request).
    const fromKey = `events/${new Date(from).toISOString().replace(/[:.]/g, "-")}`;
    const toKey   = `events/${new Date(to + 86_400_000).toISOString().replace(/[:.]/g, "-")}`;
    const inRange = blobs.filter((b) => b.key >= fromKey && b.key <= toKey);
    const events = (await Promise.all(
      inRange.map((b) => store.get(b.key, { type: "json" }) as Promise<AuditEvent>)
    )).filter((e): e is AuditEvent => !!e);
    return events.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}
