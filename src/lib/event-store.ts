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

function blobsAvailable(): boolean {
  // NETLIFY_BLOBS_CONTEXT is injected by Netlify only when Blobs is enabled for the site.
  // NETLIFY alone is not sufficient — it is always true in any Netlify environment.
  return !!process.env.NETLIFY_BLOBS_CONTEXT;
}

export async function appendEvent(event: AppendableEvent): Promise<void> {
  const full = { ...event, id: crypto.randomUUID() } as AuditEvent;
  if (!blobsAvailable()) {
    console.log("[audit]", JSON.stringify(full));
    return;
  }
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function getRecentEvents(opts?: {
  from?: number; // ms timestamp, default: now - 7 days
  to?: number;   // ms timestamp, default: now
}): Promise<AuditEvent[]> {
  if (!blobsAvailable()) {
    console.warn("[event-store] NETLIFY_BLOBS_CONTEXT not set — Blobs may not be enabled for this site.");
    return [];
  }
  try {
    const now = Date.now();
    const from = opts?.from ?? now - 7 * 86_400_000;
    const to = opts?.to ?? now;
    const store = getStore("audit");

    const fromKey = `events/${new Date(from).toISOString().replace(/[:.]/g, "-")}`;
    const toKey   = `events/${new Date(to + 86_400_000).toISOString().replace(/[:.]/g, "-")}`;

    // Non-paginated list — abort after 5 s to prevent function from hanging when
    // Blobs is misconfigured and the underlying HTTP call never resolves.
    const { blobs } = await withTimeout(
      store.list({ prefix: "events/" }),
      5000,
      "store.list"
    );

    const inRange = blobs.filter((b) => b.key >= fromKey && b.key <= toKey);

    // Fetch matched blobs in batches of 20 to avoid OOM / connection exhaustion
    const events = (
      await fetchInBatches(
        inRange.map((b) => () => store.get(b.key, { type: "json" }) as Promise<AuditEvent>),
        20,
      )
    ).filter((e): e is AuditEvent => !!e);

    return events.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("[event-store] getRecentEvents error:", err);
    return [];
  }
}
