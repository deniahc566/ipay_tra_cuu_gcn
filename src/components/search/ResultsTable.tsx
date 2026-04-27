"use client";

import { useState, Fragment } from "react";
import type { VbiRecord } from "@/types/vbi";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PaymentRecord } from "@/lib/motherduck";
import { PROD_FEE } from "@/lib/product-config";

interface ResultsTableProps {
  records: VbiRecord[];
  onCancelSuccess: () => void;
  userEmail: string;
}

type PaymentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; rows: PaymentRecord[] }
  | { status: "error"; message: string };

const CANCEL_ALLOWED = (process.env.NEXT_PUBLIC_CANCEL_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export function ResultsTable({ records, onCancelSuccess, userEmail }: ResultsTableProps) {
  const canCancel = CANCEL_ALLOWED.length === 0 || CANCEL_ALLOWED.includes(userEmail);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [confirmRecord, setConfirmRecord] = useState<VbiRecord | null>(null);
  const [paymentOpen, setPaymentOpen] = useState<Record<string, boolean>>({});
  const [paymentState, setPaymentState] = useState<Record<string, PaymentState>>({});

  async function doCancel(record: VbiRecord) {
    setConfirmRecord(null);
    setCancellingId(record.CERT_NO);
    setRowError((prev) => ({ ...prev, [record.CERT_NO]: "" }));

    try {
      const res = await fetch("/api/insurance/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          CERT_NO: record.CERT_NO,
          PROD_CODE: record.PROD_CODE,
          CAT_CODE: record.CAT_CODE,
          BOOKING_CODE: record.BOOKING_CODE,
          ORG_SALES: record.ORG_SALES,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setRowError((prev) => ({ ...prev, [record.CERT_NO]: data.rawResponse ?? data.error ?? "Hủy thất bại." }));
      } else {
        onCancelSuccess();
      }
    } catch {
      setRowError((prev) => ({ ...prev, [record.CERT_NO]: "Không thể kết nối. Vui lòng thử lại." }));
    } finally {
      setCancellingId(null);
    }
  }

  async function togglePaymentHistory(certNo: string) {
    const isOpen = paymentOpen[certNo];
    if (isOpen) {
      setPaymentOpen((prev) => ({ ...prev, [certNo]: false }));
      return;
    }
    setPaymentOpen((prev) => ({ ...prev, [certNo]: true }));

    // Only fetch if not already fetched
    const current = paymentState[certNo];
    if (current?.status === "done" || current?.status === "loading") return;

    setPaymentState((prev) => ({ ...prev, [certNo]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/insurance/payment-history?certNo=${encodeURIComponent(certNo)}`);
      const data = await res.json();
      if (!data.success) {
        setPaymentState((prev) => ({ ...prev, [certNo]: { status: "error", message: data.error ?? "Lỗi tải dữ liệu." } }));
      } else {
        setPaymentState((prev) => ({ ...prev, [certNo]: { status: "done", rows: data.data } }));
      }
    } catch {
      setPaymentState((prev) => ({ ...prev, [certNo]: { status: "error", message: "Không thể kết nối." } }));
    }
  }

  return (
    <>
    {confirmRecord && (
      <ConfirmDialog
        title="Xác nhận hủy đơn bảo hiểm"
        description={`Số chứng nhận: ${confirmRecord.CERT_NO}\nKhách hàng: ${confirmRecord.TEN_KH}\n\nHành động này không thể hoàn tác.`}
        confirmLabel="Hủy đơn"
        cancelLabel="Quay lại"
        onConfirm={() => doCancel(confirmRecord)}
        onCancel={() => setConfirmRecord(null)}
      />
    )}
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#005BAC] text-white text-left">
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Số chứng nhận</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">GCN</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Tên khách hàng</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Mã sản phẩm</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Ngày hiệu lực</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Ngày hủy đơn</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Lý do hủy</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap">Trạng thái</th>
            <th className="px-4 py-3 font-semibold whitespace-nowrap"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => {
            const isCancelled = r.STATUS?.toUpperCase() === "CANCEL";
            const isCancelling = cancellingId === r.CERT_NO;
            const isPaymentOpen = paymentOpen[r.CERT_NO] ?? false;
            const pState = paymentState[r.CERT_NO] ?? { status: "idle" };
            const safeGcnUrl = r.GCN && r.GCN.startsWith("https://") ? r.GCN : null;
            return (
              <Fragment key={r.CERT_NO || i}>
                <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {r.CERT_NO || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {safeGcnUrl ? (
                      <a
                        href={safeGcnUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#005BAC] hover:text-[#004a91] font-medium"
                      >
                        Xem GCN
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {r.TEN_KH || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {r.PROD_CODE || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                    {r.EFF_DATE || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                    {r.CANCEL_DATE || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <span className="line-clamp-2">{r.CANCEL_REASON || "—"}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={r.STATUS} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePaymentHistory(r.CERT_NO)}
                        className="text-xs font-semibold text-[#005BAC] hover:text-[#004a91] border border-[#005BAC]/30 hover:border-[#005BAC] rounded-md px-2.5 py-1 transition-colors whitespace-nowrap"
                      >
                        {isPaymentOpen ? "Ẩn lịch sử" : "Lịch sử thu phí"}
                      </button>
                      {isCancelled ? (
                        <span className="text-xs font-semibold text-slate-400 border border-slate-200 rounded-md px-2.5 py-1 cursor-not-allowed whitespace-nowrap">
                          Đã hủy
                        </span>
                      ) : !canCancel ? (
                        <span
                          title="Bạn không có quyền hủy đơn"
                          className="text-xs font-semibold text-slate-400 border border-slate-200 rounded-md px-2.5 py-1 cursor-not-allowed whitespace-nowrap"
                        >
                          Hủy
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRecord(r)}
                          disabled={isCancelling}
                          className="text-xs font-semibold text-[#D4003A] hover:text-[#a80030] border border-[#D4003A]/30 hover:border-[#D4003A] rounded-md px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isCancelling ? "Đang hủy…" : "Hủy"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isPaymentOpen && (
                  <tr className="bg-slate-50 border-t border-slate-100">
                    <td colSpan={9} className="px-6 py-3">
                      {pState.status === "loading" && (
                        <p className="text-xs text-slate-500 py-1">Đang tải lịch sử thu phí…</p>
                      )}
                      {pState.status === "error" && (
                        <p className="text-xs text-red-500 py-1">{pState.message}</p>
                      )}
                      {pState.status === "done" && pState.rows.length === 0 && (
                        <p className="text-xs text-slate-400 py-1">Không có dữ liệu thu phí.</p>
                      )}
                      {pState.status === "done" && pState.rows.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="text-xs w-full border border-slate-200 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="bg-slate-100 text-slate-600 text-left">
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">Số GCN</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">Tên khách hàng</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">Ngày thu phí</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">Kỳ thu</th>
                                <th className="px-3 py-2 font-semibold whitespace-nowrap">Số tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pState.rows.map((row, j) => (
                                <tr key={j} className="border-t border-slate-100 bg-white">
                                  <td className="px-3 py-2 font-mono text-slate-700">{row["Số GCN"] || "—"}</td>
                                  <td className="px-3 py-2 text-slate-700">{row["Tên khách hàng"] || "—"}</td>
                                  <td className="px-3 py-2 text-slate-600">{row["Ngày thu phí"] ? new Date(row["Ngày thu phí"]).toISOString().slice(0, 10) : "—"}</td>
                                  <td className="px-3 py-2 text-slate-600">{row["Kỳ thu"] || "—"}</td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{PROD_FEE[r.PROD_CODE] ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {rowError[r.CERT_NO] && (
                  <tr className="bg-red-50">
                    <td colSpan={9} className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        <pre className="flex-1 text-xs text-red-600 whitespace-pre-wrap font-mono break-all">
                          {rowError[r.CERT_NO]}
                        </pre>
                        <button
                          onClick={() => setRowError((prev) => ({ ...prev, [r.CERT_NO]: "" }))}
                          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors mt-0.5"
                          aria-label="Đóng"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
