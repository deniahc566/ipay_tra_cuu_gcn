import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { sessionOptions, type SessionData } from "@/lib/session";
import { getRecentEvents } from "@/lib/event-store";
import { Header } from "@/components/layout/Header";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EventsTable } from "@/components/admin/EventsTable";
import type { LoginSuccessEvent, LoginFailedEvent, LogoutEvent, LookupEvent, CancelEvent } from "@/types/audit";

export const metadata: Metadata = {
  title: "Admin | iPay GCN",
};

export default async function AdminPage() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);
  if (!session.user) {
    redirect("/login");
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (adminEmails.length > 0 && !adminEmails.includes(session.user.email)) {
    redirect("/search");
  }

  const events = await getRecentEvents(7);
  const logins = events.filter(
    (e): e is LoginSuccessEvent | LoginFailedEvent | LogoutEvent =>
      e.type === "login_success" || e.type === "login_failed" || e.type === "logout"
  );
  const lookups = events.filter((e): e is LookupEvent => e.type === "lookup");
  const cancels = events.filter((e): e is CancelEvent => e.type === "cancel");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header email={session.user.email} />
      <PageWrapper>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Nhật ký hoạt động</h1>
          <p className="text-sm text-slate-500 mt-1">7 ngày gần nhất</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Đăng nhập thành công</p>
            <p className="text-2xl font-bold text-green-600">
              {events.filter((e) => e.type === "login_success").length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Đăng nhập thất bại</p>
            <p className="text-2xl font-bold text-red-500">
              {events.filter((e) => e.type === "login_failed").length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Tra cứu</p>
            <p className="text-2xl font-bold text-[#012082]">
              {lookups.length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 mb-1">Hủy đơn</p>
            <p className="text-2xl font-bold text-red-600">
              {cancels.filter((e) => e.success).length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <EventsTable logins={logins} lookups={lookups} cancels={cancels} />
        </div>
      </PageWrapper>
    </div>
  );
}
