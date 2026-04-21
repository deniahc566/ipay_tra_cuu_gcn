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

async function fetchInBatches<T>(
  items: Array<() => Promise<T>>,
  batchSize = 20,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = await Promise.all(items.slice(i, i + batchSize).map((fn) => fn()));
    results.push(...batch);
  }
  return results;
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

    // Collect all blob keys in the date range using paginated listing
    const fromKey = `events/${new Date(from).toISOString().replace(/[:.]/g, "-")}`;
    const toKey   = `events/${new Date(to + 86_400_000).toISOString().replace(/[:.]/g, "-")}`;

    const inRange: string[] = [];
    for await (const page of store.list({ prefix: "events/", paginate: true })) {
      for (const b of page.blobs) {
        if (b.key >= fromKey && b.key <= toKey) inRange.push(b.key);
      }
    }

    // Fetch matched blobs in batches of 20 to avoid OOM / connection exhaustion
    const events = (
      await fetchInBatches(
        inRange.map((key) => () => store.get(key, { type: "json" }) as Promise<AuditEvent>),
        20,
      )
    ).filter((e): e is AuditEvent => !!e);

    return events.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("[event-store] getRecentEvents error:", err);
    return [];
  }
}
