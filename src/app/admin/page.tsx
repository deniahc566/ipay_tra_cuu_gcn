import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { sessionOptions, type SessionData } from "@/lib/session";
import { Header } from "@/components/layout/Header";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { EventsTable } from "@/components/admin/EventsTable";
import { appendEvent } from "@/lib/event-store";

export const metadata: Metadata = {
  title: "Admin | iPay GCN",
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export default async function AdminPage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.user) {
    redirect("/login");
  }

  // Fail-closed: if ADMIN_EMAILS is empty, no one gets access
  if (!ADMIN_EMAILS.includes(session.user.email)) {
    redirect("/search");
  }

  // Log admin access for compliance audit trail
  void appendEvent({ type: "admin_view", email: session.user.email, timestamp: Date.now() });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header email={session.user.email} />
      <PageWrapper>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Nhật ký hoạt động</h1>
        </div>
        <EventsTable />
      </PageWrapper>
    </div>
  );
}
