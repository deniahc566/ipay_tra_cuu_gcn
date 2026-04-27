import { getStore } from "@netlify/blobs";
import { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export function getClientIP(req: NextRequest): string {
  // x-nf-client-connection-ip is injected by Netlify's edge; cannot be spoofed.
  const nfIp = req.headers.get("x-nf-client-connection-ip");
  if (nfIp) return nfIp;

  // In development, trust x-forwarded-for for local testing convenience.
  // In production without the Netlify header, return "unknown" — do not accept
  // a client-controlled header as a rate-limit key.
  if (process.env.NODE_ENV !== "production") {
    return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}

const CAS_MAX_RETRIES = 3;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  failOpen = false
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore("ratelimit");
  } catch {
    if (failOpen) return { allowed: true, remaining: limit, retryAfterSec: 0 };
    return { allowed: false, remaining: 0, retryAfterSec: 60 };
  }

  const now = Date.now();

  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    let currentEntry: RateLimitEntry = { count: 0, windowStart: now };
    let currentEtag: string | undefined;

    try {
      const result = await store.getWithMetadata(key, { type: "json" });
      if (result !== null) {
        const stored = result.data as RateLimitEntry | null;
        if (stored && now - stored.windowStart < windowMs) {
          currentEntry = stored;
        }
        currentEtag = result.etag;
      }
    } catch {
      if (failOpen) return { allowed: true, remaining: limit, retryAfterSec: 0 };
      return { allowed: false, remaining: 0, retryAfterSec: 60 };
    }

    const newCount = currentEntry.count + 1;
    const windowEnd = currentEntry.windowStart + windowMs;
    const newEntry: RateLimitEntry = {
      count: newCount,
      windowStart: currentEntry.windowStart,
    };

    try {
      const writeOptions =
        currentEtag !== undefined
          ? { onlyIfMatch: currentEtag }   // key exists — only write if etag still matches
          : { onlyIfNew: true as const };  // key is new — only write if still absent

      const writeResult = await store.setJSON(key, newEntry, writeOptions);

      if (!writeResult.modified) {
        // Another concurrent request wrote first — retry with fresh read
        continue;
      }

      return {
        allowed: newCount <= limit,
        remaining: Math.max(0, limit - newCount),
        retryAfterSec: Math.ceil((windowEnd - now) / 1000),
      };
    } catch {
      continue;
    }
  }

  // All CAS retries exhausted under contention
  if (failOpen) return { allowed: true, remaining: 0, retryAfterSec: 0 };
  return { allowed: false, remaining: 0, retryAfterSec: 60 };
}
