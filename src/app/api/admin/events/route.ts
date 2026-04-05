import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getRecentEvents } from "@/lib/event-store";
import type { AuditEvent } from "@/types/audit";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.user) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length > 0 && !adminEmails.includes(session.user.email)) {
    return NextResponse.json({ success: false, error: "Không có quyền truy cập." }, { status: 403 });
  }

  const days = Math.min(Number(req.nextUrl.searchParams.get("days") ?? 7), 30);
  const events = await getRecentEvents(days);

  const logins = events.filter((e): e is AuditEvent & { type: "login_success" | "login_failed" | "logout" } =>
    e.type === "login_success" || e.type === "login_failed" || e.type === "logout"
  );
  const lookups = events.filter((e): e is AuditEvent & { type: "lookup" } => e.type === "lookup");
  const cancels = events.filter((e): e is AuditEvent & { type: "cancel" } => e.type === "cancel");

  return NextResponse.json({ success: true, logins, lookups, cancels });
}
