"use client";

import Image from "next/image";
import { useState } from "react";
import { EmailStep } from "./EmailStep";
import { OtpStep } from "./OtpStep";

const steps = ["Email", "Xác thực"];

export function LoginForm() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const currentStep = step === "email" ? 0 : 1;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#005BAC]/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-[#D4003A]/6 blur-3xl" />

      {/* Card */}
      <div className="relative w-full max-w-[420px] flex flex-col items-center">

        {/* Logo */}
        <div className="mb-8">
          <Image
            src="/logo-vbi.webp"
            alt="VBI"
            width={300}
            height={300}
            priority
            unoptimized
          />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    i < currentStep
                      ? "bg-[#005BAC] text-white"
                      : i === currentStep
                      ? "bg-[#005BAC] text-white ring-4 ring-[#005BAC]/20"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < currentStep ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    i === currentStep ? "text-[#005BAC]" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-10 h-px mx-1 ${
                    i < currentStep ? "bg-[#005BAC]" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/60 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-900">
              {step === "email" ? "Đăng nhập vào hệ thống" : "Kiểm tra hộp thư"}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              {step === "email"
                ? "Nhập email công ty để nhận mã xác thực"
                : "Nhập mã OTP 6 chữ số vừa được gửi đến email của bạn"}
            </p>
          </div>

          {step === "email" ? (
            <EmailStep
              onSuccess={(e) => {
                setEmail(e);
                setStep("otp");
              }}
            />
          ) : (
            <OtpStep email={email} onBack={() => setStep("email")} />
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-slate-400 text-center">
          © 2025 VBI Insurance · iPay Portal
        </p>
      </div>
    </div>
  );
}
