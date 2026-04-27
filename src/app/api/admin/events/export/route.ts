import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getRecentEvents } from "@/lib/event-store";
import type { AuditEvent } from "@/types/audit";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

function escapeCsv(value: string | number | boolean | undefined | null): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function eventToCsvRow(e: AuditEvent): string {
  const base = [
    escapeCsv(e.id),
    escapeCsv(e.type),
    escapeCsv(e.email),
    escapeCsv(new Date(e.timestamp).toISOString()),
    escapeCsv(e.requestId ?? ""),
    escapeCsv(e.userAgent ?? ""),
  ];

  let extra: string[];
  if (e.type === "login_failed") {
    extra = [escapeCsv(e.reason), "", "", "", "", "", ""];
  } else if (e.type === "lookup") {
    extra = [
      "",
      escapeCsv(e.criteria.CERT_NO_hash),
      escapeCsv(e.criteria.ACCOUNT_NO_hash),
      escapeCsv(e.criteria.IDCARD_hash),
      escapeCsv(e.criteria.PHONE_hash),
      escapeCsv(e.resultCount),
      escapeCsv(e.success),
    ];
  } else if (e.type === "cancel") {
    extra = ["", "", "", "", "", escapeCsv(e.certNo), escapeCsv(e.success)];
  } else {
    extra = ["", "", "", "", "", "", ""];
  }

  return [...base, ...extra].join(",");
}

const CSV_HEADER =
  "id,type,email,timestamp,requestId,userAgent,reason,cert_no_hash,account_no_hash,idcard_hash,phone_hash,cert_no,success";

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.user) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ success: false, error: "Không có quyền truy cập." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const dateFromStr = params.get("dateFrom");
  const dateToStr = params.get("dateTo");
  const emailFilter = params.get("email")?.trim().toLowerCase() ?? "";

  const now = Date.now();
  let from = now - 7 * 86_400_000;
  let to = now;

  if (dateFromStr) {
    const parsed = Date.parse(dateFromStr);
    if (!isNaN(parsed)) from = parsed;
  }
  if (dateToStr) {
    const parsed = Date.parse(dateToStr);
    if (!isNaN(parsed)) to = parsed + 86_400_000 - 1;
  }

  if (to - from > 90 * 86_400_000) {
    from = to - 90 * 86_400_000;
  }

  try {
    let events = await getRecentEvents({ from, to });

    if (emailFilter) {
      events = events.filter((e) => e.email.toLowerCase() === emailFilter);
    }

    const rows = [CSV_HEADER, ...events.map(eventToCsvRow)].join("\r\n");

    const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(rows, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[admin/export] error:", err);
    return NextResponse.json({ success: false, error: "Lỗi hệ thống." }, { status: 500 });
  }
}
