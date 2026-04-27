import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockStore = {
  get: vi.fn(),
  setJSON: vi.fn(),
  list: vi.fn(),
};

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => mockStore),
}));

const { appendEvent, getRecentEvents } = await import("@/lib/event-store");

const BASE_LOOKUP_EVENT = {
  type: "lookup" as const,
  email: "user@vbi.com.vn",
  timestamp: Date.now(),
  criteria: {
    CERT_NO_hash: "abcd1234",
    ACCOUNT_NO_hash: "",
    IDCARD_hash: "ef123456",
    PHONE_hash: "",
  },
  resultCount: 2,
  success: true,
};

describe("appendEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETLIFY_BLOBS_CONTEXT", "1");
    mockStore.setJSON.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores event to Blobs with correct key prefix", async () => {
    await appendEvent(BASE_LOOKUP_EVENT);
    expect(mockStore.setJSON).toHaveBeenCalledOnce();
    const [key, value] = mockStore.setJSON.mock.calls[0];
    expect(key).toMatch(/^events\//);
    expect(value.type).toBe("lookup");
    expect(value.email).toBe("user@vbi.com.vn");
    expect(value.id).toBeTruthy(); // UUID assigned
  });

  it("stores hashed criteria — no raw PII in audit log", async () => {
    await appendEvent(BASE_LOOKUP_EVENT);
    const [, value] = mockStore.setJSON.mock.calls[0];
    // Hashed fields present
    expect(value.criteria.IDCARD_hash).toBe("ef123456");
    // Raw PII must NOT be present
    expect(value.criteria.IDCARD).toBeUndefined();
    expect(value.criteria.PHONE_NUMBER).toBeUndefined();
    expect(value.criteria.CERT_NO).toBeUndefined();
  });

  it("falls back to console.log when Blobs store throws", async () => {
    mockStore.setJSON.mockRejectedValue(new Error("Blob unavailable"));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await appendEvent(BASE_LOOKUP_EVENT);
    expect(consoleSpy).toHaveBeenCalledWith("[audit]", expect.any(String));
    consoleSpy.mockRestore();
  });

  it("assigns a unique id to each event", async () => {
    await appendEvent(BASE_LOOKUP_EVENT);
    await appendEvent({ ...BASE_LOOKUP_EVENT });
    const id1 = mockStore.setJSON.mock.calls[0][1].id;
    const id2 = mockStore.setJSON.mock.calls[1][1].id;
    expect(id1).not.toBe(id2);
  });

  it("stores login_failed event correctly", async () => {
    await appendEvent({
      type: "login_failed",
      email: "bad@vbi.com.vn",
      timestamp: Date.now(),
      reason: "OTP_MISMATCH",
    });
    const [, value] = mockStore.setJSON.mock.calls[0];
    expect(value.type).toBe("login_failed");
    expect(value.reason).toBe("OTP_MISMATCH");
  });
});

// Reproduce the key format used by appendEvent and getRecentEvents
function makeKey(ts: number) {
  return `events/${new Date(ts).toISOString().replace(/[:.]/g, "-")}-test-id`;
}

describe("getRecentEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NETLIFY_BLOBS_CONTEXT", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Helper: make list() return only blobs whose key starts with the queried prefix.
  // getRecentEvents now calls list once per UTC year-month, so the mock must be
  // prefix-aware to avoid returning the same blob from multiple monthly calls.
  function mockListByPrefix(keys: { key: string }[]) {
    mockStore.list.mockImplementation(async ({ prefix }: { prefix: string }) => ({
      blobs: keys.filter(({ key }) => key.startsWith(prefix)),
    }));
  }

  it("returns events within the cutoff window", async () => {
    const recentTs = Date.now() - 1000;
    const oldTs = Date.now() - 10 * 86_400_000; // 10 days ago — outside 7-day default window
    const recent = { ...BASE_LOOKUP_EVENT, id: "1", timestamp: recentTs };
    mockListByPrefix([{ key: makeKey(recentTs) }, { key: makeKey(oldTs) }]);
    // Only the recent key passes the date-range filter; get is called once
    mockStore.get.mockResolvedValueOnce(recent);

    const events = await getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("1");
  });

  it("returns sorted descending by timestamp", async () => {
    const olderTs = Date.now() - 5000;
    const newerTs = Date.now() - 1000;
    const older = { ...BASE_LOOKUP_EVENT, id: "old", timestamp: olderTs };
    const newer = { ...BASE_LOOKUP_EVENT, id: "new", timestamp: newerTs };
    mockListByPrefix([{ key: makeKey(olderTs) }, { key: makeKey(newerTs) }]);
    mockStore.get.mockResolvedValueOnce(older).mockResolvedValueOnce(newer);

    const events = await getRecentEvents();
    expect(events[0].id).toBe("new");
    expect(events[1].id).toBe("old");
  });

  it("returns empty array when Blobs throws", async () => {
    mockStore.list.mockRejectedValue(new Error("Blob unavailable"));
    const events = await getRecentEvents();
    expect(events).toEqual([]);
  });

  it("filters out null/undefined blobs", async () => {
    const ts1 = Date.now() - 1000;
    const ts2 = Date.now() - 2000;
    mockListByPrefix([{ key: makeKey(ts1) }, { key: makeKey(ts2) }]);
    mockStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);
    const events = await getRecentEvents();
    expect(events).toEqual([]);
  });
});
