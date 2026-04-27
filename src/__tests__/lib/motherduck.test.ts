import { describe, it, expect, vi, beforeEach } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";

vi.mock("@duckdb/node-api", () => ({
  DuckDBInstance: { create: vi.fn() },
}));

function makeMockConn(rows: Record<string, unknown>[] = []) {
  const mockStmt = {
    bindVarchar: vi.fn(),
    runAndReadAll: vi.fn().mockResolvedValue({ getRowObjectsJS: () => rows }),
    destroySync: vi.fn(),
  };
  return {
    prepare: vi.fn().mockResolvedValue(mockStmt),
    closeSync: vi.fn(),
    _stmt: mockStmt,
  };
}

describe("getPaymentHistory", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("throws when MOTHERDUCK_TOKEN is not set", async () => {
    const original = process.env.MOTHERDUCK_TOKEN;
    delete process.env.MOTHERDUCK_TOKEN;
    const { getPaymentHistory } = await import("@/lib/motherduck");
    await expect(getPaymentHistory("VBI-001")).rejects.toThrow("MOTHERDUCK_TOKEN is not set");
    process.env.MOTHERDUCK_TOKEN = original;
  });

  it("rejects empty certNo", async () => {
    const { getPaymentHistory } = await import("@/lib/motherduck");
    await expect(getPaymentHistory("")).rejects.toThrow("Invalid certificate number");
  });

  it("rejects certNo longer than 50 chars", async () => {
    const { getPaymentHistory } = await import("@/lib/motherduck");
    await expect(getPaymentHistory("A".repeat(51))).rejects.toThrow("Invalid certificate number");
  });

  it("resets singleton and rethrows on connection failure", async () => {
    vi.mocked(DuckDBInstance.create).mockRejectedValue(new Error("Connection refused"));
    const { getPaymentHistory } = await import("@/lib/motherduck");
    await expect(getPaymentHistory("VBI-001")).rejects.toThrow("Database connection failed");
    // Second call retries (singleton was reset to null)
    await expect(getPaymentHistory("VBI-001")).rejects.toThrow("Database connection failed");
    expect(vi.mocked(DuckDBInstance.create)).toHaveBeenCalledTimes(2);
  });

  it("uses a parameterized query — certNo is bound, never interpolated", async () => {
    const mockConn = makeMockConn();
    vi.mocked(DuckDBInstance.create).mockResolvedValue({
      connect: vi.fn().mockResolvedValue(mockConn),
    } as any);

    const { getPaymentHistory } = await import("@/lib/motherduck");
    await getPaymentHistory("VBI-001");

    // SQL template contains a placeholder, not the value
    const [sql] = mockConn.prepare.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).not.toContain("VBI-001");

    // Value is bound separately as VARCHAR
    expect(mockConn._stmt.bindVarchar).toHaveBeenCalledWith(1, "VBI-001");
  });

  it("SQL injection payload is passed as a bound value, not embedded in SQL", async () => {
    const malicious = "'; DROP TABLE payment_data; --";
    const mockConn = makeMockConn();
    vi.mocked(DuckDBInstance.create).mockResolvedValue({
      connect: vi.fn().mockResolvedValue(mockConn),
    } as any);

    const { getPaymentHistory } = await import("@/lib/motherduck");
    await getPaymentHistory(malicious);

    const [sql] = mockConn.prepare.mock.calls[0];
    // The attack string must not appear in the SQL template
    expect(sql).not.toContain("DROP");
    expect(sql).not.toContain(malicious);
    // It is safely passed as a bound parameter
    expect(mockConn._stmt.bindVarchar).toHaveBeenCalledWith(1, malicious);
  });

  it("returns mapped PaymentRecord rows on success", async () => {
    const mockRows = [
      { "Số GCN": "VBI-001", "Ngày thu phí": "01/01/2024", "Kỳ thu": "1" },
    ];
    const mockConn = makeMockConn(mockRows);
    vi.mocked(DuckDBInstance.create).mockResolvedValue({
      connect: vi.fn().mockResolvedValue(mockConn),
    } as any);

    const { getPaymentHistory } = await import("@/lib/motherduck");
    const result = await getPaymentHistory("VBI-001");
    expect(result).toHaveLength(1);
    expect(result[0]["Số GCN"]).toBe("VBI-001");
    expect(result[0]["Ngày thu phí"]).toBe("01/01/2024");
    expect(mockConn.closeSync).toHaveBeenCalled();
  });

  it("destroys prepared statement after query", async () => {
    const mockConn = makeMockConn();
    vi.mocked(DuckDBInstance.create).mockResolvedValue({
      connect: vi.fn().mockResolvedValue(mockConn),
    } as any);

    const { getPaymentHistory } = await import("@/lib/motherduck");
    await getPaymentHistory("VBI-001");
    expect(mockConn._stmt.destroySync).toHaveBeenCalled();
  });

  it("closes connection even when query throws", async () => {
    const mockStmt = {
      bindVarchar: vi.fn(),
      runAndReadAll: vi.fn().mockRejectedValue(new Error("Query failed")),
      destroySync: vi.fn(),
    };
    const mockConn = {
      prepare: vi.fn().mockResolvedValue(mockStmt),
      closeSync: vi.fn(),
    };
    vi.mocked(DuckDBInstance.create).mockResolvedValue({
      connect: vi.fn().mockResolvedValue(mockConn),
    } as any);

    const { getPaymentHistory } = await import("@/lib/motherduck");
    await expect(getPaymentHistory("VBI-001")).rejects.toThrow("Query failed");
    expect(mockConn.closeSync).toHaveBeenCalled();
  });
});
