"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface EmailStepProps {
  onSuccess: (email: string) => void;
}

export function EmailStep({ onSuccess }: EmailStepProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Đã xảy ra lỗi.");
      } else {
        onSuccess(email);
      }
    } catch {
      setError("Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="email"
        label="Email công ty"
        type="email"
        placeholder="ten@vbi.com.vn"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      {error && <Alert type="error" message={error} />}
      <Button type="submit" loading={loading} className="w-full mt-1">
        Gửi mã OTP
      </Button>
    </form>
  );
}
