import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { verifyOtpToken } from "@/lib/otp-jwt";
import { sessionOptions, type SessionData } from "@/lib/session";
import { appendEvent } from "@/lib/event-store";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const otpCookie = req.cookies.get("otp_token")?.value;
  if (!otpCookie) {
    return NextResponse.json(
      { success: false, error: "Phiên xác thực không tồn tại hoặc đã hết hạn." },
      { status: 401 }
    );
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;

  let payload: { email: string; otp: string };
  try {
    payload = await verifyOtpToken(otpCookie);
  } catch {
    void appendEvent({ type: "login_failed", email: "unknown", timestamp: Date.now(), reason: "OTP_EXPIRED", userAgent });
    return NextResponse.json(
      { success: false, error: "Phiên xác thực không tồn tại hoặc đã hết hạn." },
      { status: 401 }
    );
  }

  // 5 attempts per 10-minute window (matches OTP lifetime). On lockout, invalidate
  // the OTP cookie to force a fresh OTP request — prevents unlimited brute-force
  // across repeated verify calls.
  const { allowed, retryAfterSec } = await checkRateLimit(`otp-verify:${payload.email}`, 5, 10 * 60 * 1000);
  if (!allowed) {
    const res = NextResponse.json(
      { success: false, error: "Quá nhiều lần thử. Vui lòng yêu cầu mã OTP mới." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
    res.cookies.set("otp_token", "", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return res;
  }

  const { otp: submittedOtp } = await req.json();
  if (!submittedOtp) {
    return NextResponse.json(
      { success: false, error: "Vui lòng nhập mã OTP." },
      { status: 400 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(payload.otp.padEnd(6, " "), "utf8");
  const b = Buffer.from(String(submittedOtp).padEnd(6, " "), "utf8");
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    void appendEvent({ type: "login_failed", email: payload.email, timestamp: Date.now(), reason: "OTP_MISMATCH", userAgent });
    return NextResponse.json(
      { success: false, error: "Mã OTP không đúng." },
      { status: 401 }
    );
  }

  // Create iron-session via cookies() so Set-Cookie is properly handled by Next.js
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  session.user = { email: payload.email, loginAt: Date.now() };
  await session.save();

  // Clear OTP cookie
  cookieStore.set("otp_token", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  void appendEvent({ type: "login_success", email: payload.email, timestamp: Date.now(), userAgent });
  return NextResponse.json({ success: true });
}
