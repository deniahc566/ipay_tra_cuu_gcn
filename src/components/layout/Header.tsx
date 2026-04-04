"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

interface HeaderProps {
  email: string;
}

export function Header({ email }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo-vbi.png.webp" alt="VBI Logo" width={44} height={44} priority />
          <div>
            <p className="text-[#005BAC] font-bold text-sm leading-tight">Tra cứu GCN Bảo hiểm</p>
            <p className="text-slate-400 text-xs">iPay Insurance Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-sm hidden sm:block">{email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-[#D4003A] border border-[#D4003A]/40 rounded-lg px-3 py-1.5
                       hover:bg-[#D4003A]/5 transition-colors font-medium"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
