import { getStore } from "@netlify/blobs";
import { NextRequest } from "next/server";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const store = getStore("ratelimit");
  const now = Date.now();
  let entry: RateLimitEntry = { count: 0, windowStart: now };

  try {
    const stored = (await store.get(key, {
      type: "json",
    })) as RateLimitEntry | null;
    if (stored && now - stored.windowStart < windowMs) entry = stored;
  } catch {
    // If Blobs are unavailable, fail open to avoid blocking legitimate users
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  const newCount = entry.count + 1;
  const windowEnd = entry.windowStart + windowMs;

  void store.setJSON(key, { count: newCount, windowStart: entry.windowStart });

  return {
    allowed: newCount <= limit,
    remaining: Math.max(0, limit - newCount),
    retryAfterSec: Math.ceil((windowEnd - now) / 1000),
  };
}
