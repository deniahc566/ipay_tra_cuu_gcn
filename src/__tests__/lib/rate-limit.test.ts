import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Must be declared before vi.mock (vi.mock is hoisted but the fn ref is stable)
const mockStore = {
  get: vi.fn(),
  setJSON: vi.fn(),
};

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => mockStore),
}));

// Import after mocking
const { checkRateLimit, getClientIP } = await import("@/lib/rate-limit");

describe("getClientIP", () => {
  it("prefers x-nf-client-connection-ip", () => {
    const req = new NextRequest("http://localhost/test", {
      headers: { "x-nf-client-connection-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" },
    });
    expect(getClientIP(req)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for first IP", () => {
    const req = new NextRequest("http://localhost/test", {
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" },
    });
    expect(getClientIP(req)).toBe("5.6.7.8");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new NextRequest("http://localhost/test");
    expect(getClientIP(req)).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.setJSON.mockResolvedValue(undefined);
  });

  it("allows first request (count=1, limit=5)", async () => {
    mockStore.get.mockResolvedValue(null); // no prior entry
    const result = await checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows request at the limit boundary", async () => {
    mockStore.get.mockResolvedValue({ count: 4, windowStart: Date.now() - 1000 });
    const result = await checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks request over the limit", async () => {
    mockStore.get.mockResolvedValue({ count: 5, windowStart: Date.now() - 1000 });
    const result = await checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets count when window has expired", async () => {
    // windowStart is 2 minutes ago, windowMs is 60s → expired
    mockStore.get.mockResolvedValue({ count: 99, windowStart: Date.now() - 120_000 });
    const result = await checkRateLimit("test-key", 5, 60_000);
    // Old entry ignored (window expired), fresh entry count=1
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("FAIL-CLOSED: blocks request when Blobs throws", async () => {
    mockStore.get.mockRejectedValue(new Error("Blob storage unavailable"));
    const result = await checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSec).toBe(60);
  });

  it("persists updated count to store", async () => {
    mockStore.get.mockResolvedValue({ count: 2, windowStart: Date.now() - 1000 });
    await checkRateLimit("test-key", 5, 60_000);
    expect(mockStore.setJSON).toHaveBeenCalledWith(
      "test-key",
      expect.objectContaining({ count: 3 })
    );
  });
});
