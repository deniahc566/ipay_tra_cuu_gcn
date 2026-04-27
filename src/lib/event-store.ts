import { getStore } from "@netlify/blobs";
import crypto from "crypto";
import type {
  AuditEvent,
  LoginSuccessEvent,
  LoginFailedEvent,
  LogoutEvent,
  LookupEvent,
  CancelEvent,
  AdminViewEvent,
} from "@/types/audit";

// Distributive Omit so each union member loses "id" independently
type AppendableEvent =
  | Omit<LoginSuccessEvent, "id">
  | Omit<LoginFailedEvent, "id">
  | Omit<LogoutEvent, "id">
  | Omit<LookupEvent, "id">
  | Omit<CancelEvent, "id">
  | Omit<AdminViewEvent, "id">;

function blobsAvailable(): boolean {
  // NETLIFY_BLOBS_CONTEXT is injected by Netlify only when Blobs is enabled for the site.
  // NETLIFY alone is not sufficient — it is always true in any Netlify environment.
  return !!process.env.NETLIFY_BLOBS_CONTEXT;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  // Suppress unhandled-rejection warnings on the timeout promise itself
  timeoutPromise.catch(() => {});
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function setJsonWithRetry(
  store: ReturnType<typeof getStore>,
  key: string,
  data: unknown,
  maxRetries = 2
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await store.setJSON(key, data);
      return;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
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
    await setJsonWithRetry(store, key, full);
  } catch {
    console.log("[audit]", JSON.stringify(full));
  }
}

/** Exhaust all cursor pages from Netlify Blobs list. */
async function listAllBlobs(
  store: ReturnType<typeof getStore>,
  prefix: string
): Promise<{ key: string }[]> {
  const all: { key: string }[] = [];
  let cursor: string | undefined;
  do {
    const result = await store.list({ prefix, ...(cursor ? { cursor } : {}) });
    all.push(...result.blobs);
    // @ts-expect-error — cursor field exists in Netlify Blobs v10 but is not in the type declarations
    cursor = result.cursor as string | undefined;
  } while (cursor);
  return all;
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

    // Paginate through all blobs; abort after 10 s to prevent hanging when
    // Blobs is misconfigured and the underlying HTTP call never resolves.
    const allBlobs = await withTimeout(
      listAllBlobs(store, "events/"),
      10_000,
      "store.list"
    );

    const inRange = allBlobs.filter((b) => b.key >= fromKey && b.key <= toKey);

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

/** Delete audit blobs older than `olderThanDays` days. Returns count deleted. */
export async function deleteOldEvents(olderThanDays = 365): Promise<number> {
  if (!blobsAvailable()) return 0;
  const store = getStore("audit");
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const cutoffKey = `events/${new Date(cutoff).toISOString().replace(/[:.]/g, "-")}`;

  const allBlobs = await withTimeout(listAllBlobs(store, "events/"), 30_000, "deleteOldEvents.list");
  const toDelete = allBlobs.filter((b) => b.key < cutoffKey);

  await fetchInBatches(
    toDelete.map((b) => () => store.delete(b.key)),
    20,
  );

  return toDelete.length;
}
