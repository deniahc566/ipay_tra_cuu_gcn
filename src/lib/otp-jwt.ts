import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signOtpToken(email: string, otp: string): Promise<string> {
  return new SignJWT({ email, otp, purpose: "login" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

export async function verifyOtpToken(token: string): Promise<{ email: string; otp: string }> {
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== "login") throw new Error("Invalid token purpose");
  return payload as { email: string; otp: string; purpose: string };
}
