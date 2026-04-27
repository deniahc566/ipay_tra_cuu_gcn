import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getRecentEvents } from "@/lib/event-store";
import type { LoginSuccessEvent, LoginFailedEvent, LogoutEvent, LookupEvent, CancelEvent } from "@/types/audit";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    if (!session.user) {
      return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
    }

    // Fail-closed: if ADMIN_EMAILS is empty, no one gets access
    if (!ADMIN_EMAILS.includes(session.user.email)) {
      return NextResponse.json({ success: false, error: "Không có quyền truy cập." }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;

    // Parse date range — YYYY-MM-DD strings from the date picker
    const dateFromStr = params.get("dateFrom");
    const dateToStr = params.get("dateTo");
    const emailFilter = params.get("email")?.trim().toLowerCase() ?? "";

    const now = Date.now();
    const defaultFrom = now - 7 * 86_400_000;

    let from = defaultFrom;
    let to = now;

    if (dateFromStr) {
      const parsed = Date.parse(dateFromStr);
      if (!isNaN(parsed)) from = parsed;
    }
    if (dateToStr) {
      const parsed = Date.parse(dateToStr);
      // dateTo is inclusive — advance to end of that day
      if (!isNaN(parsed)) to = parsed + 86_400_000 - 1;
    }

    // Cap max range at 90 days
    if (to - from > 90 * 86_400_000) {
      from = to - 90 * 86_400_000;
    }

    let events = await getRecentEvents({ from, to });

    if (emailFilter) {
      events = events.filter((e) => e.email.toLowerCase() === emailFilter);
    }

    // admin_view events are stored for compliance but excluded from the UI listing
    // to avoid infinite-loop noise (every fetch would add more admin_view entries).
    const logins = events.filter(
      (e): e is LoginSuccessEvent | LoginFailedEvent | LogoutEvent =>
        e.type === "login_success" || e.type === "login_failed" || e.type === "logout"
    );
    const lookups = events.filter((e): e is LookupEvent => e.type === "lookup");
    const cancels = events.filter((e): e is CancelEvent => e.type === "cancel");

    let body: string;
    try {
      body = JSON.stringify({ success: true, logins, lookups, cancels });
    } catch (serErr) {
      console.error("[admin/events] JSON serialization failed:", serErr);
      return NextResponse.json({ success: false, error: "Lỗi serialize dữ liệu." }, { status: 500 });
    }
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[admin/events] unhandled error:", err);
    return NextResponse.json(
      { success: false, error: "Lỗi hệ thống. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
