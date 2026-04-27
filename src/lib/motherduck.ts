import { DuckDBInstance } from "@duckdb/node-api";

export interface PaymentRecord {
  "Số GCN": string;
  "Ngày thu phí": string;
  "Kỳ thu": string;
}

// Singleton — reuse across requests to avoid re-authenticating with MotherDuck each time.
// `connecting` holds the in-flight promise so concurrent cold-start requests share one
// auth attempt instead of each spawning their own.
let instance: InstanceType<typeof DuckDBInstance> | null = null;
let connecting: Promise<InstanceType<typeof DuckDBInstance>> | null = null;

async function getInstance(): Promise<InstanceType<typeof DuckDBInstance>> {
  if (instance) return instance;
  if (connecting) return connecting;

  connecting = (async () => {
    const token = process.env.MOTHERDUCK_TOKEN;
    if (!token) throw new Error("MOTHERDUCK_TOKEN is not set");
    // DuckDB resolves home_directory from the HOME env var before reading config.
    // In Netlify serverless functions HOME is unset, so we must set it explicitly.
    if (!process.env.HOME) process.env.HOME = "/tmp";
    try {
      instance = await DuckDBInstance.create(`md:?motherduck_token=${token}`, {
        home_directory: "/tmp",
      });
      return instance;
    } catch {
      instance = null;
      // Do not re-throw the original error — it contains the token in the connection string
      throw new Error("Database connection failed");
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export async function getPaymentHistory(certNo: string): Promise<PaymentRecord[]> {
  if (!certNo || certNo.length > 50) throw new Error("Invalid certificate number");

  const db = await getInstance();

  let conn: Awaited<ReturnType<typeof db.connect>>;
  try {
    conn = await db.connect();
  } catch (err) {
    // Stale instance — force reconnect on the next request
    instance = null;
    throw err;
  }

  try {
    // Parameterized query — certNo is bound as a typed VARCHAR value,
    // never interpolated into the SQL string, making injection structurally impossible.
    const stmt = await conn.prepare(
      `SELECT
         "Số hợp đồng VBI" AS "Số GCN",
         "Ngày thu phí",
         "Kỳ thu"
       FROM ipay_data.bronze.payment_data
       WHERE "Số hợp đồng VBI" = $1
       ORDER BY "Kỳ thu"
       LIMIT 200`
    );
    stmt.bindVarchar(1, certNo);
    const reader = await stmt.runAndReadAll();
    stmt.destroySync();
    const rows = reader.getRowObjectsJS() as Record<string, unknown>[];
    return rows.map((row) => ({
      "Số GCN": String(row["Số GCN"] ?? ""),
      "Ngày thu phí": String(row["Ngày thu phí"] ?? ""),
      "Kỳ thu": String(row["Kỳ thu"] ?? ""),
    }));
  } finally {
    conn.closeSync();
  }
}
