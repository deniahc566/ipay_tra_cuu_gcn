import type { VbiRecord } from "@/types/vbi";

const VBI_ENDPOINT =
  "https://openapi.evbi.vn/sapi/GET-INFOR-CONTRACT-BY-INFOR-CUSTOMER";

export interface VbiLookupInput {
  CERT_NO: string;
  ACCOUNT_NO: string;
  IDCARD: string;
  PHONE_NUMBER: string;
}

export const PHONE_RE = /^[0-9]{9,11}$/;
export const IDCARD_RE = /^[0-9]{9,12}$/;
export const CERT_NO_RE = /^[a-zA-Z0-9\-\/]{1,50}$/;
export const ACCOUNT_NO_RE = /^[0-9]{6,20}$/;

/** Validate non-empty fields against expected formats before sending to VBI */
function validateInput(input: VbiLookupInput): void {
  if (input.PHONE_NUMBER && !PHONE_RE.test(input.PHONE_NUMBER))
    throw new Error("PHONE_NUMBER format invalid");
  if (input.IDCARD && !IDCARD_RE.test(input.IDCARD))
    throw new Error("IDCARD format invalid");
  if (input.CERT_NO && !CERT_NO_RE.test(input.CERT_NO))
    throw new Error("CERT_NO format invalid");
  if (input.ACCOUNT_NO && !ACCOUNT_NO_RE.test(input.ACCOUNT_NO))
    throw new Error("ACCOUNT_NO format invalid");
}

// Sanitize to prevent single-quote injection into the Python-style dict string
function sanitize(value: string): string {
  return value.replace(/'/g, "").trim();
}

export async function vbiApiLookup(input: VbiLookupInput): Promise<VbiRecord[]> {
  const apiKey = process.env.VBI_API_KEY;
  if (!apiKey) throw new Error("VBI_API_KEY is not configured");

  validateInput(input);

  const pObjInput = `{'CERT_NO': '${sanitize(input.CERT_NO)}', 'ACCOUNT_NO': '${sanitize(input.ACCOUNT_NO)}', 'IDCARD': '${sanitize(input.IDCARD)}', 'PHONE_NUMBER': '${sanitize(input.PHONE_NUMBER)}'}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(VBI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ P_OBJ_INPUT: pObjInput }),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`VBI API HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error_message ?? JSON.stringify(json));

  const raw: Record<string, string>[] = json.data?.cur_list_0 ?? [];

  if (!Array.isArray(raw)) {
    console.warn("[vbi-api] Unexpected response shape — cur_list_0 is not an array:", typeof raw);
    return [];
  }

  return raw.map((r) => {
    if (!r["Tên Khách hàng"] && !r["CERT_NO"]) {
      console.warn("[vbi-api] Record missing expected fields:", Object.keys(r));
    }
    return {
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
    };
  });
}
