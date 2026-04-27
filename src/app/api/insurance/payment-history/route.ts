import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import crypto from "crypto";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getPaymentHistory } from "@/lib/motherduck";
import { withTimeout } from "@/lib/event-store";

const TIMEOUT_MS = 20_000;

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.user) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  const certNo = req.nextUrl.searchParams.get("certNo");
  if (!certNo || certNo.length > 50 || !/^[a-zA-Z0-9\-_]+$/.test(certNo)) {
    return NextResponse.json({ success: false, error: "Số chứng nhận không hợp lệ." }, { status: 400 });
  }

  const requestId = crypto.randomUUID();

  try {
    const rows = await withTimeout(getPaymentHistory(certNo), TIMEOUT_MS, "getPaymentHistory");
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    console.error(`[payment-history] requestId=${requestId} error:`, message);
    return NextResponse.json(
      { success: false, error: `Lỗi hệ thống. Mã lỗi: ${requestId}` },
      { status: 500 }
    );
  }
}
