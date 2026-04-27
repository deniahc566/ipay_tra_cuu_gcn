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

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  failOpen = false
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  // Netlify Blobs requires a runtime context that only exists in Netlify functions.
  // Skip rate limiting in development so local testing is not blocked.
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }

  let store: ReturnType<typeof getStore>;
  try {
    store = getStore("ratelimit");
  } catch {
    if (failOpen) return { allowed: true, remaining: limit, retryAfterSec: 0 };
    return { allowed: false, remaining: 0, retryAfterSec: 60 };
  }

  const now = Date.now();

  try {
    const result = await store.getWithMetadata(key, { type: "json" });

    let entry: RateLimitEntry = { count: 0, windowStart: now };
    if (result !== null) {
      const stored = result.data as RateLimitEntry | null;
      if (stored && now - stored.windowStart < windowMs) {
        entry = stored;
      }
    }

    const newCount = entry.count + 1;
    const windowEnd = entry.windowStart + windowMs;
    const newEntry: RateLimitEntry = { count: newCount, windowStart: entry.windowStart };

    await store.setJSON(key, newEntry);

    return {
      allowed: newCount <= limit,
      remaining: Math.max(0, limit - newCount),
      retryAfterSec: Math.ceil((windowEnd - now) / 1000),
    };
  } catch {
    if (failOpen) return { allowed: true, remaining: limit, retryAfterSec: 0 };
    return { allowed: false, remaining: 0, retryAfterSec: 60 };
  }
}
