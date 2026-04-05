import { describe, it, expect, vi, beforeEach } from "vitest";
import { vbiApiLookup } from "@/lib/vbi-api";

const EMPTY = { CERT_NO: "", ACCOUNT_NO: "", IDCARD: "", PHONE_NUMBER: "" };

const mockSuccessResponse = {
  success: true,
  data: {
    cur_list_0: [
      {
        CERT_NO: "VBI-IPAY-001",
        GCN: "GCN-001",
        "Tên Khách hàng": "Nguyễn Văn A",
        PROD_CODE: "PROD1",
        CAT_CODE: "CAT1",
        BOOKING_CODE: "BK001",
        ORG_SALES: "VIETINBANK",
        "Ngày hiệu lực": "01/01/2024",
        "Ngày hủy đơn": "",
        "Lý do hủy": "",
        STATUS: "ACTIVE",
      },
    ],
  },
};

describe("vbiApiLookup — input validation", () => {
  it("throws on invalid PHONE_NUMBER format", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, PHONE_NUMBER: "abc123" })
    ).rejects.toThrow("PHONE_NUMBER format invalid");
  });

  it("throws on PHONE_NUMBER too short (< 9 digits)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, PHONE_NUMBER: "12345678" })
    ).rejects.toThrow("PHONE_NUMBER format invalid");
  });

  it("throws on PHONE_NUMBER too long (> 11 digits)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, PHONE_NUMBER: "012345678901" })
    ).rejects.toThrow("PHONE_NUMBER format invalid");
  });

  it("accepts valid 10-digit phone number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
    }));
    await expect(
      vbiApiLookup({ ...EMPTY, PHONE_NUMBER: "0912345678" })
    ).resolves.toBeDefined();
    vi.unstubAllGlobals();
  });

  it("throws on invalid IDCARD format (letters)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, IDCARD: "ABC123456" })
    ).rejects.toThrow("IDCARD format invalid");
  });

  it("throws on IDCARD too short (< 9 digits)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, IDCARD: "12345678" })
    ).rejects.toThrow("IDCARD format invalid");
  });

  it("throws on IDCARD too long (> 12 digits)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, IDCARD: "1234567890123" })
    ).rejects.toThrow("IDCARD format invalid");
  });

  it("accepts valid 12-digit CCCD", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
    }));
    await expect(
      vbiApiLookup({ ...EMPTY, IDCARD: "012345678901" })
    ).resolves.toBeDefined();
    vi.unstubAllGlobals();
  });

  it("throws on CERT_NO with special characters", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, CERT_NO: "VBI<script>" })
    ).rejects.toThrow("CERT_NO format invalid");
  });

  it("accepts valid CERT_NO with hyphens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
    }));
    await expect(
      vbiApiLookup({ ...EMPTY, CERT_NO: "VBI-IPAY-2024-001" })
    ).resolves.toBeDefined();
    vi.unstubAllGlobals();
  });

  it("throws on ACCOUNT_NO with letters", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, ACCOUNT_NO: "ABC12345" })
    ).rejects.toThrow("ACCOUNT_NO format invalid");
  });

  it("throws on ACCOUNT_NO too short (< 6 digits)", async () => {
    await expect(
      vbiApiLookup({ ...EMPTY, ACCOUNT_NO: "12345" })
    ).rejects.toThrow("ACCOUNT_NO format invalid");
  });

  it("allows all empty fields (skips validation)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { cur_list_0: [] } }),
    }));
    await expect(vbiApiLookup(EMPTY)).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe("vbiApiLookup — API communication", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when VBI_API_KEY is not set", async () => {
    const original = process.env.VBI_API_KEY;
    delete process.env.VBI_API_KEY;
    await expect(vbiApiLookup(EMPTY)).rejects.toThrow("VBI_API_KEY is not configured");
    process.env.VBI_API_KEY = original;
  });

  it("throws on non-2xx HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    }));
    await expect(vbiApiLookup(EMPTY)).rejects.toThrow("VBI API HTTP 503");
  });

  it("throws when VBI returns success: false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error_message: "Không tìm thấy dữ liệu" }),
    }));
    await expect(vbiApiLookup(EMPTY)).rejects.toThrow("Không tìm thấy dữ liệu");
  });

  it("returns empty array when cur_list_0 is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    }));
    const result = await vbiApiLookup(EMPTY);
    expect(result).toEqual([]);
  });

  it("maps VBI response fields to VbiRecord correctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse,
    }));
    const [record] = await vbiApiLookup(EMPTY);
    expect(record.CERT_NO).toBe("VBI-IPAY-001");
    expect(record.TEN_KH).toBe("Nguyễn Văn A");
    expect(record.STATUS).toBe("ACTIVE");
  });

  it("builds Python-dict-style P_OBJ_INPUT payload with correct field values", async () => {
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_, init) => {
      capturedBody = init.body as string;
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { cur_list_0: [] } }),
      });
    }));
    await vbiApiLookup({ CERT_NO: "VBI-001", ACCOUNT_NO: "123456789", IDCARD: "012345678901", PHONE_NUMBER: "0912345678" });
    const parsed = JSON.parse(capturedBody);
    expect(parsed.P_OBJ_INPUT).toContain("'CERT_NO': 'VBI-001'");
    expect(parsed.P_OBJ_INPUT).toContain("'IDCARD': '012345678901'");
    expect(parsed.P_OBJ_INPUT).toContain("'PHONE_NUMBER': '0912345678'");
  });

  it("format validation rejects single quotes — quote injection impossible", async () => {
    // Single quotes in IDCARD fail format validation before reaching sanitize
    await expect(
      vbiApiLookup({ ...EMPTY, IDCARD: "012'345'678901" })
    ).rejects.toThrow("IDCARD format invalid");
  });
});
