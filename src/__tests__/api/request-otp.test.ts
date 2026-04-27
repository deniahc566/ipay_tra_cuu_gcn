import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 }),
  getClientIP: vi.fn().mockReturnValue("1.2.3.4"),
}));
vi.mock("@/lib/otp-jwt", () => ({
  signOtpToken: vi.fn().mockResolvedValue("mock.jwt.token"),
}));
vi.mock("@/lib/resend", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/auth/request-otp/route";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendOtpEmail } from "@/lib/resend";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/request-otp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 });
    vi.mocked(sendOtpEmail).mockResolvedValue(undefined);
  });

  it("returns 400 for missing email", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Email/i);
  });

  it("returns generic 200 when email domain is not allowed (anti-enumeration)", async () => {
    // The route deliberately returns the same 200 response for disallowed domains
    // so callers cannot distinguish "not on allowlist" from "OTP sent".
    const res = await POST(makeRequest({ email: "user@gmail.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 120 });
    const res = await POST(makeRequest({ email: "user@vbi.com.vn" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });

  it("returns 502 when email sending fails", async () => {
    vi.mocked(sendOtpEmail).mockRejectedValue(new Error("SMTP error"));
    const res = await POST(makeRequest({ email: "user@vbi.com.vn" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 200 and sets httpOnly otp_token cookie on success", async () => {
    const res = await POST(makeRequest({ email: "user@vbi.com.vn" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("otp_token=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("sends OTP email to the provided address", async () => {
    await POST(makeRequest({ email: "user@vbi.com.vn" }));
    expect(sendOtpEmail).toHaveBeenCalledWith("user@vbi.com.vn", expect.any(String));
  });

  it("OTP in email is a 6-digit number", async () => {
    await POST(makeRequest({ email: "user@vbi.com.vn" }));
    const [, otp] = vi.mocked(sendOtpEmail).mock.calls[0];
    expect(otp).toMatch(/^\d{6}$/);
  });
});
