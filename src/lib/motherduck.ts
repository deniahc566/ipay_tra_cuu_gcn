import { DuckDBInstance } from "@duckdb/node-api";

export interface PaymentRecord {
  "Số GCN": string;
  "Tên khách hàng": string;
  "Ngày thu phí": string;
  "Kỳ thu": string;
}

// Singleton — reuse across requests to avoid re-authenticating with MotherDuck each time
let instance: InstanceType<typeof DuckDBInstance> | null = null;

async function getInstance(): Promise<InstanceType<typeof DuckDBInstance>> {
  if (!instance) {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_TOKEN is not set");
    // DuckDB resolves home_directory from the HOME env var before reading config.
    // In Netlify serverless functions HOME is unset, so we must set it explicitly.
    if (!process.env.HOME) process.env.HOME = "/tmp";
    try {
      instance = await DuckDBInstance.create(`md:?motherduck_token=${token}`, {
        home_directory: "/tmp",
      });
    } catch {
      // Do not re-throw the original error — it contains the token in the connection string
      throw new Error("Database connection failed");
    }
  }
  return instance;
}

export async function getPaymentHistory(certNo: string): Promise<PaymentRecord[]> {
  if (!certNo || certNo.length > 50) throw new Error("Invalid certificate number");

  let db: InstanceType<typeof DuckDBInstance>;
  try {
    db = await getInstance();
  } catch (err) {
    // Reset on connection failure so next request retries
    instance = null;
    throw err;
  }

  const conn = await db.connect();
  try {
    // Parameterized query — certNo is bound as a typed VARCHAR value,
    // never interpolated into the SQL string, making injection structurally impossible.
    const stmt = await conn.prepare(
      `SELECT
         "Số hợp đồng VBI" AS "Số GCN",
         "Tên khách hàng",
         "Ngày thu phí",
         "Kỳ thu"
       FROM ipay_data.bronze.payment_data
       WHERE "Số hợp đồng VBI" = $1
       ORDER BY "Kỳ thu"`
    );
    stmt.bindVarchar(1, certNo);
    const reader = await stmt.runAndReadAll();
    stmt.destroySync();
    const rows = reader.getRowObjectsJS() as Record<string, unknown>[];
    return rows.map((row) => ({
      "Số GCN": String(row["Số GCN"] ?? ""),
      "Tên khách hàng": String(row["Tên khách hàng"] ?? ""),
      "Ngày thu phí": String(row["Ngày thu phí"] ?? ""),
      "Kỳ thu": String(row["Kỳ thu"] ?? ""),
    }));
  } finally {
    conn.closeSync();
  }
}
