import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  user: { email: "admin@vbi.com.vn", loginAt: Date.now() } as
    | { email: string; loginAt: number }
    | undefined,
};

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockImplementation(async () => mockSession),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock("@/lib/event-store", () => ({
  getRecentEvents: vi.fn().mockResolvedValue([
    { id: "1", type: "login_success", email: "user@vbi.com.vn", timestamp: Date.now() },
    { id: "2", type: "lookup", email: "user@vbi.com.vn", timestamp: Date.now(), criteria: { CERT_NO_hash: "abc", ACCOUNT_NO_hash: "", IDCARD_hash: "", PHONE_hash: "" }, resultCount: 1, success: true },
    { id: "3", type: "cancel", email: "cancel@vbi.com.vn", timestamp: Date.now(), certNo: "VBI-001", success: true },
    { id: "4", type: "login_failed", email: "x@vbi.com.vn", timestamp: Date.now(), reason: "OTP_MISMATCH" },
    { id: "5", type: "logout", email: "user@vbi.com.vn", timestamp: Date.now() },
  ]),
}));

import { GET } from "@/app/api/admin/events/route";
import { getRecentEvents } from "@/lib/event-store";

function makeRequest(params: Record<string, string> = {}) {
  const search = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/admin/events${search ? `?${search}` : ""}`);
}

describe("GET /api/admin/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.user = { email: "admin@vbi.com.vn", loginAt: Date.now() };
  });

  it("returns 401 when not logged in", async () => {
    mockSession.user = undefined;
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mockSession.user = { email: "regular@vbi.com.vn", loginAt: Date.now() };
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/quyền/);
  });

  it("returns 200 with categorised events for admin", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.logins).toHaveLength(3); // login_success + login_failed + logout
    expect(body.lookups).toHaveLength(1);
    expect(body.cancels).toHaveLength(1);
  });

  it("passes days param to getRecentEvents (max 30)", async () => {
    await GET(makeRequest({ days: "14" }));
    expect(vi.mocked(getRecentEvents)).toHaveBeenCalledWith(14);
  });

  it("clamps days param to 30 maximum", async () => {
    await GET(makeRequest({ days: "99" }));
    expect(vi.mocked(getRecentEvents)).toHaveBeenCalledWith(30);
  });

  it("defaults to 7 days when no param provided", async () => {
    await GET(makeRequest());
    expect(vi.mocked(getRecentEvents)).toHaveBeenCalledWith(7);
  });

  it("lookup events contain hashed criteria, not raw PII", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    const lookup = body.lookups[0];
    // Hashed field present
    expect(lookup.criteria.CERT_NO_hash).toBeDefined();
    // No raw PII fields
    expect(lookup.criteria.CERT_NO).toBeUndefined();
    expect(lookup.criteria.IDCARD).toBeUndefined();
  });
});
