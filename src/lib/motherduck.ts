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
    instance = await DuckDBInstance.create(`md:?motherduck_token=${token}`);
  }
  return instance;
}

// Allow only safe characters in cert numbers (alphanumeric, hyphen, underscore)
function safeCertNo(value: string): string {
  return value.replace(/[^a-zA-Z0-9\-_]/g, "");
}

export async function getPaymentHistory(certNo: string): Promise<PaymentRecord[]> {
  const safe = safeCertNo(certNo);
  if (!safe) throw new Error("Invalid certificate number");

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
    const reader = await conn.runAndReadAll(
      `SELECT
         "Số hợp đồng VBI" AS "Số GCN",
         "Tên khách hàng",
         "Ngày thu phí",
         "Kỳ thu"
       FROM ipay_data.bronze.payment_data
       WHERE "Số hợp đồng VBI" = '${safe}'
       ORDER BY "Kỳ thu"`
    );
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
