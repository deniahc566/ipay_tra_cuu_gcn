import { describe, it, expect, vi, beforeEach } from "vitest";

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
    mockStore.setJSON.mockResolvedValue(undefined);
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

describe("getRecentEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns events within the cutoff window", async () => {
    const recent = { ...BASE_LOOKUP_EVENT, id: "1", timestamp: Date.now() - 1000 };
    const old = { ...BASE_LOOKUP_EVENT, id: "2", timestamp: Date.now() - 10 * 86_400_000 };
    mockStore.list.mockResolvedValue({ blobs: [{ key: "events/a" }, { key: "events/b" }] });
    mockStore.get
      .mockResolvedValueOnce(recent)
      .mockResolvedValueOnce(old);

    const events = await getRecentEvents(7);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("1");
  });

  it("returns sorted descending by timestamp", async () => {
    const older = { ...BASE_LOOKUP_EVENT, id: "old", timestamp: Date.now() - 5000 };
    const newer = { ...BASE_LOOKUP_EVENT, id: "new", timestamp: Date.now() - 1000 };
    mockStore.list.mockResolvedValue({ blobs: [{ key: "events/a" }, { key: "events/b" }] });
    mockStore.get.mockResolvedValueOnce(older).mockResolvedValueOnce(newer);

    const events = await getRecentEvents(7);
    expect(events[0].id).toBe("new");
    expect(events[1].id).toBe("old");
  });

  it("returns empty array when Blobs throws", async () => {
    mockStore.list.mockRejectedValue(new Error("Blob unavailable"));
    const events = await getRecentEvents(7);
    expect(events).toEqual([]);
  });

  it("filters out null/undefined blobs", async () => {
    mockStore.list.mockResolvedValue({ blobs: [{ key: "events/a" }, { key: "events/b" }] });
    mockStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);
    const events = await getRecentEvents(7);
    expect(events).toEqual([]);
  });
});
