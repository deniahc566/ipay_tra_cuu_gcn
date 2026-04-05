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
vi.mock("@/lib/motherduck", () => ({
  getPaymentHistory: vi.fn().mockResolvedValue([
    {
      "Số GCN": "VBI-001",
      "Tên khách hàng": "Nguyễn Văn A",
      "Ngày thu phí": "01/01/2024",
      "Kỳ thu": "1",
    },
  ]),
}));

import { GET } from "@/app/api/insurance/payment-history/route";
import { getPaymentHistory } from "@/lib/motherduck";

function makeRequest(certNo?: string) {
  const url = `http://localhost/api/insurance/payment-history${certNo ? `?certNo=${certNo}` : ""}`;
  return new NextRequest(url);
}

describe("GET /api/insurance/payment-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.user = { email: "user@vbi.com.vn", loginAt: Date.now() };
    vi.mocked(getPaymentHistory).mockResolvedValue([
      { "Số GCN": "VBI-001", "Tên khách hàng": "A", "Ngày thu phí": "01/01/2024", "Kỳ thu": "1" },
    ]);
  });

  it("returns 401 when not logged in", async () => {
    mockSession.user = undefined;
    const res = await GET(makeRequest("VBI-001"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when certNo is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/chứng nhận/);
  });

  it("returns 400 when certNo contains special characters", async () => {
    const res = await GET(makeRequest("VBI<script>"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when certNo is longer than 50 chars", async () => {
    const res = await GET(makeRequest("A".repeat(51)));
    expect(res.status).toBe(400);
  });

  it("returns 200 with payment records on success", async () => {
    const res = await GET(makeRequest("VBI-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]["Số GCN"]).toBe("VBI-001");
  });

  it("passes certNo to getPaymentHistory", async () => {
    await GET(makeRequest("VBI-IPAY-2024"));
    expect(vi.mocked(getPaymentHistory)).toHaveBeenCalledWith("VBI-IPAY-2024");
  });

  it("returns 500 when getPaymentHistory throws", async () => {
    vi.mocked(getPaymentHistory).mockRejectedValue(new Error("DB connection failed"));
    const res = await GET(makeRequest("VBI-001"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("accepts certNo with hyphens and underscores", async () => {
    const res = await GET(makeRequest("VBI-IPAY_2024-001"));
    expect(res.status).toBe(200);
  });
});
