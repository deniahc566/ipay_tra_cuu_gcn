"use client";

import { useState } from "react";
import type { AuditEvent, LoginSuccessEvent, LoginFailedEvent, LogoutEvent, LookupEvent, CancelEvent } from "@/types/audit";

type LoginEvent = LoginSuccessEvent | LoginFailedEvent | LogoutEvent;

interface Props {
  logins: LoginEvent[];
  lookups: LookupEvent[];
  cancels: CancelEvent[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function LoginBadge({ type }: { type: AuditEvent["type"] }) {
  if (type === "login_success")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Đăng nhập</span>;
  if (type === "logout")
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Đăng xuất</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Thất bại</span>;
}

function LookupBadge({ success, count }: { success: boolean; count: number }) {
  if (!success)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Lỗi</span>;
  if (count === 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">0 kết quả</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{count} kết quả</span>;
}

export function EventsTable({ logins, lookups, cancels }: Props) {
  const [tab, setTab] = useState<"logins" | "lookups" | "cancels">("logins");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <button
          onClick={() => setTab("logins")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "logins"
              ? "border-[#012082] text-[#012082]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Đăng nhập ({logins.length})
        </button>
        <button
          onClick={() => setTab("lookups")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "lookups"
              ? "border-[#012082] text-[#012082]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Tra cứu GCN ({lookups.length})
        </button>
        <button
          onClick={() => setTab("cancels")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "cancels"
              ? "border-red-600 text-red-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Hủy đơn ({cancels.length})
        </button>
      </div>

      {tab === "logins" && (
        logins.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012082] text-white text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Thời gian</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Kết quả</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {logins.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><LoginBadge type={e.type} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {e.type === "login_failed" ? e.reason : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "lookups" && (
        lookups.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012082] text-white text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Thời gian</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Số GCN</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Số HĐ</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">CCCD</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">SĐT</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {lookups.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.CERT_NO || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.ACCOUNT_NO || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.IDCARD || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.PHONE_NUMBER || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <LookupBadge success={e.success} count={e.resultCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "cancels" && (
        cancels.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#012082] text-white text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Thời gian</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Số chứng nhận</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Kết quả</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {cancels.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.certNo || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.success
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Thành công</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Thất bại</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[300px]">
                      <span className="line-clamp-2">{e.error || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
