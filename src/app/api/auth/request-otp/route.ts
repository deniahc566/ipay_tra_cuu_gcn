import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { signOtpToken } from "@/lib/otp-jwt";
import { sendOtpEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "Email không hợp lệ." },
      { status: 400 }
    );
  }

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain !== allowedDomain.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: "Email không được phép truy cập." },
        { status: 403 }
      );
    }
  }

  const otp = String(randomInt(100000, 1000000));
  let token: string;

  try {
    token = await signOtpToken(email, otp);
  } catch {
    return NextResponse.json(
      { success: false, error: "Lỗi hệ thống. Vui lòng thử lại." },
      { status: 500 }
    );
  }

  try {
    await sendOtpEmail(email, otp);
  } catch {
    return NextResponse.json(
      { success: false, error: "Không thể gửi email. Vui lòng thử lại." },
      { status: 502 }
    );
  }

  const res = NextResponse.json({ success: true, message: "OTP đã được gửi đến email của bạn." });
  res.cookies.set("otp_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
