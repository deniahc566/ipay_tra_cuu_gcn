import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { appendEvent } from "@/lib/event-store";
import { checkRateLimit } from "@/lib/rate-limit";

const CANCEL_ENDPOINT =
  "https://openapi.evbi.vn/sapi/ipay-cancel-insurance-order";

interface CancelInput {
  CERT_NO: string;
  PROD_CODE: string;
  CAT_CODE: string;
  BOOKING_CODE: string;
  ORG_SALES: string;
}

function nowVN(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Convert to VN time by offsetting UTC+7
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${pad(now.getUTCDate())}/${pad(now.getUTCMonth() + 1)}/${now.getUTCFullYear()} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.user) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  const allowedEmails = (process.env.CANCEL_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (allowedEmails.length > 0 && !allowedEmails.includes(session.user.email)) {
    return NextResponse.json(
      { success: false, error: "Không có quyền thực hiện thao tác này." },
      { status: 403 }
    );
  }

  const { allowed, retryAfterSec } = await checkRateLimit(`cancel:${session.user.email}`, 200, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Vượt quá giới hạn hủy đơn. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const cancelApiKey = process.env.VBI_CANCEL_API_KEY;
  if (!cancelApiKey) {
    return NextResponse.json({ success: false, error: "Lỗi cấu hình hệ thống." }, { status: 500 });
  }

  const body: Partial<CancelInput> = await req.json();
  const { CERT_NO, PROD_CODE, CAT_CODE, BOOKING_CODE, ORG_SALES } = body;

  if (!CERT_NO) {
    return NextResponse.json(
      { success: false, error: "Thiếu thông tin chứng nhận." },
      { status: 400 }
    );
  }

  const payload = {
    PROCESS_CODE: "ED8FD02A-B5E4-41D6-A873-092193FC4F23",
    REQUEST: {
      ORG_SALES: ORG_SALES ?? "VIETINBANK",
      CAT_CODE: CAT_CODE ?? "",
      PROD_CODE: PROD_CODE ?? "",
      BOOKING_CODE: BOOKING_CODE ?? "",
      SALES_CHANNEL: "PARTNER",
      PARTNER_CHANNEL: "IPAY",
      CANCEL_ORDER: {
        CERTIFICATE_NO: CERT_NO,
        APPLY_TIME: nowVN(),
        CASE_NO: "90128387123789871",
      },
    },
  };

  try {
    const res = await fetch(CANCEL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": cancelApiKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const rawBody = await res.text().catch(() => "(unreadable)");
      void appendEvent({
        type: "cancel",
        email: session.user.email,
        timestamp: Date.now(),
        certNo: CERT_NO ?? "",
        success: false,
        error: `HTTP ${res.status}: ${rawBody}`,
      });
      return NextResponse.json(
        { success: false, rawResponse: `HTTP ${res.status}:\n${rawBody}` },
        { status: 502 }
      );
    }

    const json = await res.json();

    if (!json.success || json.data?.success === false) {
      const errorMsg = json.data?.message ?? json.error_message ?? "VBI cancel error";
      void appendEvent({
        type: "cancel",
        email: session.user.email,
        timestamp: Date.now(),
        certNo: CERT_NO ?? "",
        success: false,
        error: errorMsg,
      });
      return NextResponse.json(
        { success: false, rawResponse: JSON.stringify(json, null, 2) },
        { status: 502 }
      );
    }

    void appendEvent({
      type: "cancel",
      email: session.user.email,
      timestamp: Date.now(),
      certNo: CERT_NO,
      success: true,
    });

    return NextResponse.json({
      success: true,
      message: json.data?.message ?? "Hủy đơn bảo hiểm thành công!",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    void appendEvent({
      type: "cancel",
      email: session.user.email,
      timestamp: Date.now(),
      certNo: CERT_NO ?? "",
      success: false,
      error: message,
    });
    return NextResponse.json(
      { success: false, rawResponse: message },
      { status: 502 }
    );
  }
}
