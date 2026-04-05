import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  user: { email: "cancel@vbi.com.vn", loginAt: Date.now() } as
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
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 199, retryAfterSec: 0 }),
}));

import { POST } from "@/app/api/insurance/cancel/route";
import { appendEvent } from "@/lib/event-store";
import { checkRateLimit } from "@/lib/rate-limit";

const SUCCESS_PAYLOAD = { CERT_NO: "VBI-001", PROD_CODE: "P1", CAT_CODE: "C1", BOOKING_CODE: "BK1", ORG_SALES: "VIETINBANK" };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/insurance/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insurance/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.user = { email: "cancel@vbi.com.vn", loginAt: Date.now() };
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 199, retryAfterSec: 0 });
    vi.unstubAllGlobals();
  });

  // --- Auth ---
  it("returns 401 when not logged in", async () => {
    mockSession.user = undefined;
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(401);
  });

  // --- Rate limit ---
  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 300 });
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("rate limit key is scoped to email, not global", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { success: true, message: "OK" } }),
    }));
    await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(vi.mocked(checkRateLimit)).toHaveBeenCalledWith(
      "cancel:cancel@vbi.com.vn",
      200,
      60 * 60 * 1000
    );
  });

  // --- RBAC ---
  it("returns 403 for user not in CANCEL_ALLOWED_EMAILS", async () => {
    mockSession.user = { email: "regular@vbi.com.vn", loginAt: Date.now() };
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/quyền/);
  });

  it("allows user in CANCEL_ALLOWED_EMAILS", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { success: true, message: "Hủy thành công" } }),
    }));
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(200);
  });

  // --- Config check ---
  it("returns 500 when VBI_CANCEL_API_KEY is missing", async () => {
    const original = process.env.VBI_CANCEL_API_KEY;
    delete process.env.VBI_CANCEL_API_KEY;
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(500);
    process.env.VBI_CANCEL_API_KEY = original;
  });

  // --- Input validation ---
  it("returns 400 when CERT_NO is missing", async () => {
    const res = await POST(makeRequest({ PROD_CODE: "P1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/chứng nhận/i);
  });

  // --- Upstream errors ---
  it("returns 502 when VBI API returns non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(502);
  });

  it("returns 502 when VBI response has success: false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { success: false, message: "Đơn đã hủy" } }),
    }));
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const res = await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(res.status).toBe(502);
  });

  // --- Audit logging ---
  it("logs successful cancel event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { success: true, message: "OK" } }),
    }));
    await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancel", certNo: "VBI-001", success: true })
    );
  });

  it("logs failed cancel event on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad request",
    }));
    await POST(makeRequest(SUCCESS_PAYLOAD));
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancel", certNo: "VBI-001", success: false })
    );
  });
});
