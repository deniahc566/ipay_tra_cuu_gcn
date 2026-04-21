import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { signOtpToken } from "@/lib/otp-jwt";
import { sendOtpEmail } from "@/lib/resend";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "Email không hợp lệ." },
      { status: 400 }
    );
  }

  // Rate limit BEFORE allowlist check — prevents enumeration via rate-limit side-channel
  // and prevents email bombing of valid addresses.
  const ip = getClientIP(req);
  const { allowed: ipAllowed, retryAfterSec: ipRetry } = await checkRateLimit(
    `otp-req:ip:${ip}`,
    10,
    15 * 60 * 1000
  );
  if (!ipAllowed) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": String(ipRetry) } }
    );
  }

  const normalizedEmail = email.toLowerCase();
  const { allowed: emailAllowed, retryAfterSec: emailRetry } = await checkRateLimit(
    `otp-req:email:${normalizedEmail}`,
    3,
    10 * 60 * 1000
  );
  if (!emailAllowed) {
    return NextResponse.json(
      { success: false, error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": String(emailRetry) } }
    );
  }

  // Generic response used for non-allowed emails — same 200 as a real send,
  // so callers cannot distinguish whether the email is on the allowlist.
  const genericOk = NextResponse.json({
    success: true,
    message: "Nếu email của bạn có trong hệ thống, mã OTP đã được gửi.",
  });

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain) {
    const domain = normalizedEmail.split("@")[1];
    if (domain !== allowedDomain.toLowerCase()) {
      return genericOk;
    }
  }

  const otp = String(randomInt(100000, 1000000));
  let token: string;

  try {
    token = await signOtpToken(normalizedEmail, otp);
  } catch {
    return NextResponse.json(
      { success: false, error: "Lỗi hệ thống. Vui lòng thử lại." },
      { status: 500 }
    );
  }

  try {
    await sendOtpEmail(normalizedEmail, otp);
  } catch (err) {
    console.error("[request-otp] sendOtpEmail failed:", err);
    return NextResponse.json(
      { success: false, error: "Không thể gửi email. Vui lòng thử lại." },
      { status: 502 }
    );
  }

  const res = NextResponse.json({
    success: true,
    message: "Nếu email của bạn có trong hệ thống, mã OTP đã được gửi.",
  });
  res.cookies.set("otp_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
