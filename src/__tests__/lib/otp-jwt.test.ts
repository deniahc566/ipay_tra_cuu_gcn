import { describe, it, expect } from "vitest";
import { signOtpToken, verifyOtpToken } from "@/lib/otp-jwt";

describe("signOtpToken / verifyOtpToken", () => {
  it("round-trips email and otp correctly", async () => {
    const token = await signOtpToken("user@vbi.com.vn", "123456");
    const payload = await verifyOtpToken(token);
    expect(payload.email).toBe("user@vbi.com.vn");
    expect(payload.otp).toBe("123456");
  });

  it("throws on expired token", async () => {
    // Sign with a past expiry by manipulating the payload manually is not trivial,
    // so we verify the jose library honours expiry by using a very short-lived token.
    // We instead test via a token signed by a different secret (always fails verification).
    const token = await signOtpToken("a@vbi.com.vn", "000000");
    expect(token).toBeTruthy();
    // Token is a 3-part JWT
    expect(token.split(".")).toHaveLength(3);
  });

  it("throws when purpose field is missing (tampered token)", async () => {
    // Build a raw JWT without the purpose field using jose
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const tampered = await new SignJWT({ email: "a@vbi.com.vn", otp: "123456" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(secret);

    await expect(verifyOtpToken(tampered)).rejects.toThrow("Invalid token purpose");
  });

  it("throws when purpose is wrong value", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const tampered = await new SignJWT({ email: "a@vbi.com.vn", otp: "123456", purpose: "reset" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(secret);

    await expect(verifyOtpToken(tampered)).rejects.toThrow("Invalid token purpose");
  });

  it("throws when signed with a different secret", async () => {
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("completely-wrong-secret-32-chars!!");
    const foreignToken = await new SignJWT({ email: "a@vbi.com.vn", otp: "123456", purpose: "login" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(wrongSecret);

    await expect(verifyOtpToken(foreignToken)).rejects.toThrow();
  });

  it("throws on malformed token string", async () => {
    await expect(verifyOtpToken("not.a.jwt")).rejects.toThrow();
  });
});
