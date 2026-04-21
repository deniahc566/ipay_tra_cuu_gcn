import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { appendEvent } from "@/lib/event-store";

export async function POST() {
  const cookieStore = cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  if (!session.user) {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }
  const email = session.user.email;
  session.destroy();
  void appendEvent({ type: "logout", email, timestamp: Date.now() });
  return NextResponse.json({ success: true });
}
