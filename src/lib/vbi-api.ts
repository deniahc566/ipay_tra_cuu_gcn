import type { VbiRecord } from "@/types/vbi";

const VBI_ENDPOINT =
  "https://openapi.evbi.vn/sapi/GET-INFOR-CONTRACT-BY-INFOR-CUSTOMER";

export interface VbiLookupInput {
  CERT_NO: string;
  ACCOUNT_NO: string;
  IDCARD: string;
  PHONE_NUMBER: string;
}

// Sanitize to prevent single-quote injection into the Python-style dict string
function sanitize(value: string): string {
  return value.replace(/'/g, "").trim();
}

export async function vbiApiLookup(input: VbiLookupInput): Promise<VbiRecord[]> {
  const apiKey = process.env.VBI_API_KEY;
  if (!apiKey) throw new Error("VBI_API_KEY is not configured");

  const pObjInput = `{'CERT_NO': '${sanitize(input.CERT_NO)}', 'ACCOUNT_NO': '${sanitize(input.ACCOUNT_NO)}', 'IDCARD': '${sanitize(input.IDCARD)}', 'PHONE_NUMBER': '${sanitize(input.PHONE_NUMBER)}'}`;

  const res = await fetch(VBI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ P_OBJ_INPUT: pObjInput }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`VBI API HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error_message ?? JSON.stringify(json));

  const raw: Record<string, string>[] = json.data?.cur_list_0 ?? [];

  return raw.map((r) => ({
    CERT_NO: r["CERT_NO"] ?? "",
    GCN: r["GCN"] ?? "",
    TEN_KH: r["Tên Khách hàng"] ?? "",
    PROD_CODE: r["PROD_CODE"] ?? "",
    CAT_CODE: r["CAT_CODE"] ?? "",
    BOOKING_CODE: r["BOOKING_CODE"] ?? "",
    ORG_SALES: r["ORG_SALES"] ?? "",
    EFF_DATE: r["Ngày hiệu lực"] ?? "",
    CANCEL_DATE: r["Ngày hủy đơn"] ?? "",
    CANCEL_REASON: r["Lý do hủy"] ?? "",
    STATUS: r["STATUS"] ?? "",
  }));
}
