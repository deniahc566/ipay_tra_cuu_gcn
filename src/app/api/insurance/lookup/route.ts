import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { vbiApiLookup, type VbiLookupInput } from "@/lib/vbi-api";
import { appendEvent } from "@/lib/event-store";

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.user) {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }

  const body: Partial<VbiLookupInput> = await req.json();
  const { CERT_NO = "", ACCOUNT_NO = "", IDCARD = "", PHONE_NUMBER = "" } = body;
  const criteria = { CERT_NO, ACCOUNT_NO, IDCARD, PHONE_NUMBER };

  if (!CERT_NO && !ACCOUNT_NO && !IDCARD && !PHONE_NUMBER) {
    return NextResponse.json(
      { success: false, error: "Vui lòng nhập ít nhất một điều kiện tìm kiếm." },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const email = session.user.email;

  try {
    const records = await vbiApiLookup({ CERT_NO, ACCOUNT_NO, IDCARD, PHONE_NUMBER });
    void appendEvent({ type: "lookup", email, timestamp, criteria, resultCount: records.length, success: true });
    return NextResponse.json({ success: true, data: records });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    void appendEvent({ type: "lookup", email, timestamp, criteria, resultCount: 0, success: false, error: message });
    return NextResponse.json(
      { success: false, error: `Lỗi kết nối đến hệ thống VBI: ${message}` },
      { status: 502 }
    );
  }
}
