import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { appendEvent } from "@/lib/event-store";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (!session.user) {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }
  const email = session.user.email;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  session.destroy();
  void appendEvent({ type: "logout", email, timestamp: Date.now(), userAgent });
  return NextResponse.json({ success: true });
}
