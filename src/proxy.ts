import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|login|api/auth/|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)).*)",
  ],
};

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.next();

  let session: SessionData;
  try {
    session = await getIronSession<SessionData>(req, res, sessionOptions);
  } catch {
    session = {};
  }

  if (session.user) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}
