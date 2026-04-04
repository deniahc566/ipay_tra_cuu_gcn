"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface OtpStepProps {
  email: string;
  onBack: () => void;
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function OtpStep({ email, onBack }: OtpStepProps) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Mã OTP không đúng.");
      } else {
        window.location.href = "/search";
      }
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    try {
      await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setCooldown(60);
    } catch {
      // silent fail — user can try again
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Mã OTP đã được gửi đến{" "}
        <span className="font-medium text-slate-800">{maskEmail(email)}</span>
      </p>
      <Input
        id="otp"
        label="Mã OTP (6 chữ số)"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="123456"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        required
        autoFocus
      />
      {error && <Alert type="error" message={error} />}
      <Button type="submit" loading={loading} className="w-full mt-1">
        Xác nhận
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-slate-500 hover:text-slate-700 transition-colors"
        >
          ← Đổi email
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="text-[#005BAC] hover:text-[#004a91] disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {cooldown > 0 ? `Gửi lại (${cooldown}s)` : "Gửi lại mã"}
        </button>
      </div>
    </form>
  );
}
