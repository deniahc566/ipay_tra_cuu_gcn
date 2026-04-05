import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { signOtpToken } from "@/lib/otp-jwt";

const mockSession = { user: undefined as { email: string; loginAt: number } | undefined, save: vi.fn(), destroy: vi.fn() };

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockImplementation(async () => mockSession),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 }),
}));
vi.mock("@/lib/event-store", () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/auth/verify-otp/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { appendEvent } from "@/lib/event-store";

async function makeRequest(otp: string, cookie?: string) {
  // Generate a real signed token so verifyOtpToken works
  const token = cookie ?? (await signOtpToken("user@vbi.com.vn", "123456"));
  return new NextRequest("http://localhost/api/auth/verify-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `otp_token=${token}`,
    },
    body: JSON.stringify({ otp }),
  });
}

describe("POST /api/auth/verify-otp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.user = undefined;
    mockSession.save.mockResolvedValue(undefined);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSec: 0 });
  });

  it("returns 401 when otp_token cookie is missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp: "123456" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a tampered / invalid token", async () => {
    const req = new NextRequest("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "otp_token=invalid.token.here",
      },
      body: JSON.stringify({ otp: "123456" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "login_failed", reason: "OTP_EXPIRED" })
    );
  });

  it("returns 429 when verify rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 300 });
    const req = await makeRequest("123456");
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
  });

  it("returns 400 when otp body field is missing", async () => {
    const token = await signOtpToken("user@vbi.com.vn", "123456");
    const req = new NextRequest("http://localhost/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `otp_token=${token}` },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 and logs OTP_MISMATCH on wrong OTP", async () => {
    const req = await makeRequest("000000"); // token has 123456
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "login_failed", reason: "OTP_MISMATCH" })
    );
  });

  it("returns 200 and logs login_success on correct OTP", async () => {
    const req = await makeRequest("123456");
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(vi.mocked(appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "login_success", email: "user@vbi.com.vn" })
    );
  });

  it("saves session with user email on success", async () => {
    const req = await makeRequest("123456");
    await POST(req);
    expect(mockSession.save).toHaveBeenCalled();
    expect(mockSession.user?.email).toBe("user@vbi.com.vn");
  });
});
