import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { sessionOptions, type SessionData } from "@/lib/session";
import { Header } from "@/components/layout/Header";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SearchForm } from "@/components/search/SearchForm";

export const metadata: Metadata = {
  title: "Tra cứu GCN | iPay",
};

export default async function SearchPage() {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions);

  if (!session.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col">
      <Header email={session.user.email} />
      <PageWrapper className="max-w-[1600px]">
        <SearchForm userEmail={session.user.email} />
      </PageWrapper>
    </div>
  );
}
