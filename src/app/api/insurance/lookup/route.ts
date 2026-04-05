import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import crypto from "crypto";
import { sessionOptions, type SessionData } from "@/lib/session";
import { vbiApiLookup, type VbiLookupInput } from "@/lib/vbi-api";
import { appendEvent } from "@/lib/event-store";
import { checkRateLimit } from "@/lib/rate-limit";

const PHONE_RE = /^[0-9]{9,11}$/;
const IDCARD_RE = /^[0-9]{9,12}$/;
const CERT_NO_RE = /^[a-zA-Z0-9\-\/]{1,50}$/;
const ACCOUNT_NO_RE = /^[0-9]{6,20}$/;

function hashField(value: string): string {
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.user) {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập." },
      { status: 401, headers: { "X-Request-ID": requestId } }
    );
  }

  const { allowed } = await checkRateLimit(`lookup:${session.user.email}`, 200, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Vượt quá giới hạn tra cứu. Vui lòng thử lại sau." },
      { status: 429, headers: { "X-Request-ID": requestId } }
    );
  }

  const body: Partial<VbiLookupInput> = await req.json();
  const { CERT_NO = "", ACCOUNT_NO = "", IDCARD = "", PHONE_NUMBER = "" } = body;

  if (!CERT_NO && !ACCOUNT_NO && !IDCARD && !PHONE_NUMBER) {
    return NextResponse.json(
      { success: false, error: "Vui lòng nhập ít nhất một điều kiện tìm kiếm." },
      { status: 400, headers: { "X-Request-ID": requestId } }
    );
  }

  // Format validation — only applied to non-empty fields
  if (PHONE_NUMBER && !PHONE_RE.test(PHONE_NUMBER)) {
    return NextResponse.json(
      { success: false, error: "Số điện thoại không hợp lệ (9–11 chữ số)." },
      { status: 400, headers: { "X-Request-ID": requestId } }
    );
  }
  if (IDCARD && !IDCARD_RE.test(IDCARD)) {
    return NextResponse.json(
      { success: false, error: "Số CCCD/CMND không hợp lệ (9–12 chữ số)." },
      { status: 400, headers: { "X-Request-ID": requestId } }
    );
  }
  if (CERT_NO && !CERT_NO_RE.test(CERT_NO)) {
    return NextResponse.json(
      { success: false, error: "Số chứng nhận không hợp lệ." },
      { status: 400, headers: { "X-Request-ID": requestId } }
    );
  }
  if (ACCOUNT_NO && !ACCOUNT_NO_RE.test(ACCOUNT_NO)) {
    return NextResponse.json(
      { success: false, error: "Số tài khoản không hợp lệ (6–20 chữ số)." },
      { status: 400, headers: { "X-Request-ID": requestId } }
    );
  }

  const timestamp = Date.now();
  const email = session.user.email;
  // Hash PII before storing in audit log — use first 8 hex chars of sha256 for correlation without reversal
  const criteria = {
    CERT_NO_hash: hashField(CERT_NO),
    ACCOUNT_NO_hash: hashField(ACCOUNT_NO),
    IDCARD_hash: hashField(IDCARD),
    PHONE_hash: hashField(PHONE_NUMBER),
  };

  try {
    const records = await vbiApiLookup({ CERT_NO, ACCOUNT_NO, IDCARD, PHONE_NUMBER });
    void appendEvent({ type: "lookup", email, timestamp, requestId, criteria, resultCount: records.length, success: true });
    return NextResponse.json(
      { success: true, data: records },
      { headers: { "X-Request-ID": requestId } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    void appendEvent({ type: "lookup", email, timestamp, requestId, criteria, resultCount: 0, success: false, error: `[${requestId}] VBI error` });
    console.error(`[lookup] requestId=${requestId}`, message);
    return NextResponse.json(
      { success: false, error: `Lỗi kết nối đến hệ thống VBI. Mã lỗi: ${requestId}` },
      { status: 502, headers: { "X-Request-ID": requestId } }
    );
  }
}
