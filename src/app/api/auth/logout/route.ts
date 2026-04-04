import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { appendEvent } from "@/lib/event-store";

export async function POST() {
  const cookieStore = cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const email = session.user?.email ?? "unknown";
  session.destroy();
  void appendEvent({ type: "logout", email, timestamp: Date.now() });
  return NextResponse.json({ success: true });
}
