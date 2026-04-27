import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  user: { email: "user@vbi.com.vn", loginAt: Date.now() } as
    | { email: string; loginAt: number }
    | undefined,
};

vi.mock("iron-session", () => ({
  getIronSession: vi.fn().mockImplementation(async () => mockSession),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock("@/lib/vbi-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vbi-api")>();
  return {
    ...actual,
    vbiApiLookup: vi.fn().mockResolvedValue([
      {
        CERT_NO: "VBI-001",
        GCN: "GCN-001",
        TEN_KH: "Nguyễn Văn A",
        PROD_CODE: "",
        CAT_CODE: "",
        BOOKING_CODE: "",
        ORG_SALES: "VIETINBANK",
        EFF_DATE: "01/01/2024",
        CANCEL_DATE: "",
        CANCEL_REASON: "",
        STATUS: "ACTIVE",
      },
    ]),
  };
});
vi.mock("@/lib/event-store", () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/insurance/lookup/route";
import { vbiApiLookup } from "@/lib/vbi-api";
import { appendEvent } from "@/lib/event-store";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/insurance/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insurance/lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.user = { email: "user@vbi.com.vn", loginAt: Date.now() };
  });

  // --- Auth ---
  it("returns 401 when not logged in", async () => {
    mockSession.user = undefined;
    const res = await POST(makeRequest({ CERT_NO: "VBI-001" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("returns 429 after exceeding in-memory rate limit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      // Exhaust the limit + 1 extra request
      const limit = 200;
      for (let i = 0; i < limit; i++) {
        await POST(makeRequest({ CERT_NO: `VBI-${i}` }));
      }
      const res = await POST(makeRequest({ CERT_NO: "VBI-OVER" }));
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // --- Input validation ---
  it("returns 400 when all criteria are empty", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ít nhất/);
  });

  it("returns 400 for invalid PHONE_NUMBER (letters)", async () => {
    const res = await POST(makeRequest({ PHONE_NUMBER: "abc12345" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/điện thoại/);
  });

  it("returns 400 for PHONE_NUMBER with < 9 digits", async () => {
    const res = await POST(makeRequest({ PHONE_NUMBER: "12345678" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid IDCARD (letters)", async () => {
    const res = await POST(makeRequest({ IDCARD: "ABC12345678" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/CCCD/);
  });

  it("returns 400 for IDCARD with < 9 digits", async () => {
    const res = await POST(makeRequest({ IDCARD: "12345678" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for CERT_NO with special characters", async () => {
    const res = await POST(makeRequest({ CERT_NO: "VBI<xss>" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/chứng nhận/);
  });

  it("returns 400 for ACCOUNT_NO with letters", async () => {
    const res = await POST(makeRequest({ ACCOUNT_NO: "ABC123456" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tài khoản/);
  });

  it("returns 400 for ACCOUNT_NO shorter than 6 digits", async () => {
    const res = await POST(makeRequest({ ACCOUNT_NO: "12345" }));
    expect(res.status).toBe(400);
  });

  // --- Success ---
  it("returns 200 with data and X-Request-ID on success", async () => {
    const res = await POST(makeRequest({ CERT_NO: "VBI-001" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  // --- PII audit log safety ---
  it("logs hashed criteria — no raw PII in audit event", async () => {
    await POST(makeRequest({ IDCARD: "012345678901", PHONE_NUMBER: "0912345678" }));
    const call = vi.mocked(appendEvent).mock.calls[0][0];
    if (call.type === "lookup") {
      // Hashed fields exist
      expect(call.criteria.IDCARD_hash).toBeTruthy();
      expect(call.criteria.PHONE_hash).toBeTruthy();
      // Raw PII must NOT be present
      expect((call.criteria as Record<string, unknown>).IDCARD).toBeUndefined();
      expect((call.criteria as Record<string, unknown>).PHONE_NUMBER).toBeUndefined();
    }
  });

  it("includes requestId in audit event", async () => {
    await POST(makeRequest({ CERT_NO: "VBI-001" }));
    const call = vi.mocked(appendEvent).mock.calls[0][0];
    expect(call.requestId).toBeTruthy();
    expect(call.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("error response includes requestId mã lỗi — no raw VBI error", async () => {
    vi.mocked(vbiApiLookup).mockRejectedValue(new Error("Internal VBI details: token=secret123"));
    const res = await POST(makeRequest({ CERT_NO: "VBI-001" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    // Client sees only the request ID, not the raw VBI error
    expect(body.error).toMatch(/Mã lỗi:/);
    expect(body.error).not.toContain("token=secret123");
  });

  it("X-Request-ID is present on all error responses", async () => {
    mockSession.user = undefined;
    const res1 = await POST(makeRequest({}));
    expect(res1.headers.get("X-Request-ID")).toBeTruthy();

    mockSession.user = { email: "user@vbi.com.vn", loginAt: Date.now() };
    const res2 = await POST(makeRequest({})); // empty criteria → 400
    expect(res2.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("calls vbiApiLookup with the raw (unhashed) values", async () => {
    await POST(makeRequest({ CERT_NO: "VBI-001", PHONE_NUMBER: "0912345678" }));
    expect(vi.mocked(vbiApiLookup)).toHaveBeenCalledWith(
      expect.objectContaining({ CERT_NO: "VBI-001", PHONE_NUMBER: "0912345678" })
    );
  });
});
