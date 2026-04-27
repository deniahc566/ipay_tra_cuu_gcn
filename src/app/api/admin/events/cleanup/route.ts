import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { deleteOldEvents } from "@/lib/event-store";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.user) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ success: false, error: "Không có quyền truy cập." }, { status: 403 });
  }

  let olderThanDays = 365;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.olderThanDays === "number" && body.olderThanDays > 0) {
      olderThanDays = Math.floor(body.olderThanDays);
    }
  } catch {
    // use default
  }

  try {
    const deleted = await deleteOldEvents(olderThanDays);
    return NextResponse.json({ success: true, deleted, olderThanDays });
  } catch (err) {
    console.error("[admin/cleanup] error:", err);
    return NextResponse.json({ success: false, error: "Lỗi hệ thống." }, { status: 500 });
  }
}
