import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";

export default async function RootPage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (session.user) {
    redirect("/search");
  } else {
    redirect("/login");
  }
}
