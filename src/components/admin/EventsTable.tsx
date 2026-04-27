"use client";

import { useState, useEffect, Fragment } from "react";
import type {
  AuditEvent,
  LoginSuccessEvent,
  LoginFailedEvent,
  LogoutEvent,
  LookupEvent,
  CancelEvent,
} from "@/types/audit";

type LoginEvent = LoginSuccessEvent | LoginFailedEvent | LogoutEvent;
type Tab = "logins" | "lookups" | "cancels";
type ResultFilter = "all" | "success" | "failed";

interface EventsData {
  logins: LoginEvent[];
  lookups: LookupEvent[];
  cancels: CancelEvent[];
}

const PAGE_SIZE = 50;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
const DEFAULT_TO = isoDate(new Date());
const DEFAULT_FROM = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return isoDate(d);
})();

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

function DetailPanel({ event, colSpan }: { event: AuditEvent; colSpan: number }) {
  const fields: Array<{ label: string; value: string; isError?: boolean }> = [
    { label: "ID", value: event.id },
    ...(event.requestId ? [{ label: "Request ID", value: event.requestId }] : []),
    { label: "Thời gian (UTC)", value: new Date(event.timestamp).toISOString() },
    { label: "Loại sự kiện", value: event.type },
    { label: "Email", value: event.email },
  ];

  if (event.type === "login_failed") {
    fields.push({ label: "Lý do thất bại", value: event.reason, isError: true });
  } else if (event.type === "lookup") {
    fields.push(
      { label: "Hash CERT_NO", value: event.criteria.CERT_NO_hash || "—" },
      { label: "Hash ACCOUNT_NO", value: event.criteria.ACCOUNT_NO_hash || "—" },
      { label: "Hash CCCD", value: event.criteria.IDCARD_hash || "—" },
      { label: "Hash SĐT", value: event.criteria.PHONE_hash || "—" },
      { label: "Số kết quả", value: String(event.resultCount) },
      { label: "Thành công", value: event.success ? "Có" : "Không" },
    );
    if (event.error) fields.push({ label: "Lỗi", value: event.error, isError: true });
  } else if (event.type === "cancel") {
    fields.push(
      { label: "Số chứng nhận", value: event.certNo },
      { label: "Thành công", value: event.success ? "Có" : "Không" },
    );
    if (event.error) fields.push({ label: "Lỗi", value: event.error, isError: true });
  }

  return (
    <tr className="bg-slate-50 border-t border-dashed border-slate-200">
      <td colSpan={colSpan} className="px-6 py-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs max-w-3xl">
          {fields.map(({ label, value, isError }) => (
            <div key={label} className="contents">
              <dt className="text-slate-500 font-medium whitespace-nowrap self-start pt-0.5">{label}:</dt>
              {isError ? (
                <dd>
                  <pre className="text-red-600 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 bg-red-50 rounded p-2 text-xs">{value}</pre>
                </dd>
              ) : (
                <dd className="text-slate-700 font-mono break-all">{value}</dd>
              )}
            </div>
          ))}
        </dl>
      </td>
    </tr>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function EventsTable() {
  const [tab, setTab] = useState<Tab>("logins");

  // Draft filter state (edits in the bar before applying)
  const [draftFrom, setDraftFrom] = useState(DEFAULT_FROM);
  const [draftTo, setDraftTo] = useState(DEFAULT_TO);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftResult, setDraftResult] = useState<ResultFilter>("all");

  // Applied filter state (what was last fetched)
  const [appliedFrom, setAppliedFrom] = useState(DEFAULT_FROM);
  const [appliedTo, setAppliedTo] = useState(DEFAULT_TO);
  const [appliedEmail, setAppliedEmail] = useState("");
  const [appliedResult, setAppliedResult] = useState<ResultFilter>("all");

  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [data, setData] = useState<EventsData>({ logins: [], lookups: [], cancels: [] });
  const [pages, setPages] = useState<Record<Tab, number>>({ logins: 1, lookups: 1, cancels: 1 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchData(from: string, to: string, email: string) {
    setLoading(true);
    setFetchError("");
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (email) params.set("email", email.trim().toLowerCase());
      const res = await fetch(`/api/admin/events?${params}`);
      if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
        setFetchError(`Lỗi server HTTP ${res.status}. Xem Netlify Function logs để biết chi tiết.`);
        return;
      }
      const json = await res.json();
      if (!json.success) {
        setFetchError(json.error ?? "Lỗi tải dữ liệu.");
        return;
      }
      setData({ logins: json.logins, lookups: json.lookups, cancels: json.cancels });
    } catch (err) {
      setFetchError(`Không thể kết nối đến hệ thống. (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(DEFAULT_FROM, DEFAULT_TO, ""); }, []);

  function handleApply() {
    if (draftFrom > draftTo) {
      setFetchError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    setFetchError("");
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedEmail(draftEmail);
    setAppliedResult(draftResult);
    setPages({ logins: 1, lookups: 1, cancels: 1 });
    setExpandedId(null);
    fetchData(draftFrom, draftTo, draftEmail);
  }

  function handleReset() {
    setDraftFrom(DEFAULT_FROM);
    setDraftTo(DEFAULT_TO);
    setDraftEmail("");
    setDraftResult("all");
    setAppliedFrom(DEFAULT_FROM);
    setAppliedTo(DEFAULT_TO);
    setAppliedEmail("");
    setAppliedResult("all");
    setFetchError("");
    setPages({ logins: 1, lookups: 1, cancels: 1 });
    setExpandedId(null);
    fetchData(DEFAULT_FROM, DEFAULT_TO, "");
  }

  const isFiltered =
    appliedFrom !== DEFAULT_FROM ||
    appliedTo !== DEFAULT_TO ||
    appliedEmail !== "" ||
    appliedResult !== "all";

  // Apply result filter client-side
  const visibleLogins =
    appliedResult === "all"
      ? data.logins
      : appliedResult === "success"
      ? data.logins.filter((e) => e.type !== "login_failed")
      : data.logins.filter((e) => e.type === "login_failed");

  const visibleLookups =
    appliedResult === "all"
      ? data.lookups
      : appliedResult === "success"
      ? data.lookups.filter((e) => e.success)
      : data.lookups.filter((e) => !e.success);

  const visibleCancels =
    appliedResult === "all"
      ? data.cancels
      : appliedResult === "success"
      ? data.cancels.filter((e) => e.success)
      : data.cancels.filter((e) => !e.success);

  function paginate<T>(items: T[], t: Tab): T[] {
    const p = pages[t];
    return items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }

  function totalPages(count: number) {
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }

  function Pagination({ forTab, total }: { forTab: Tab; total: number }) {
    const tp = totalPages(total);
    const cur = pages[forTab];
    if (tp <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
        <button
          disabled={cur === 1}
          onClick={() => setPages((p) => ({ ...p, [forTab]: p[forTab] - 1 }))}
          className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          ← Trang trước
        </button>
        <span className="text-xs">Trang {cur} / {tp} ({total} dòng)</span>
        <button
          disabled={cur === tp}
          onClick={() => setPages((p) => ({ ...p, [forTab]: p[forTab] + 1 }))}
          className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors"
        >
          Trang tiếp →
        </button>
      </div>
    );
  }

  function toggleDetail(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Đăng nhập thành công</p>
          <p className="text-2xl font-bold text-green-600">
            {loading ? "…" : data.logins.filter((e) => e.type === "login_success").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Đăng nhập thất bại</p>
          <p className="text-2xl font-bold text-red-500">
            {loading ? "…" : data.logins.filter((e) => e.type === "login_failed").length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Tra cứu</p>
          <p className="text-2xl font-bold text-[#012082]">
            {loading ? "…" : data.lookups.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500 mb-1">Hủy đơn</p>
          <p className="text-2xl font-bold text-red-600">
            {loading ? "…" : data.cancels.filter((e) => e.success).length}
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-5 pb-5 border-b border-slate-100 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Từ ngày</label>
            <input
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#012082]/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Đến ngày</label>
            <input
              type="date"
              value={draftTo}
              min={draftFrom}
              onChange={(e) => setDraftTo(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#012082]/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Email</label>
            <input
              type="text"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              placeholder="user@vbi.com.vn"
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-[#012082]/30"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Kết quả</label>
            <select
              value={draftResult}
              onChange={(e) => setDraftResult(e.target.value as ResultFilter)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#012082]/30 bg-white"
            >
              <option value="all">Tất cả</option>
              <option value="success">Thành công</option>
              <option value="failed">Thất bại</option>
            </select>
          </div>
          <div className="flex gap-2 pb-0.5">
            <button
              onClick={handleApply}
              disabled={loading}
              className="text-sm font-semibold bg-[#012082] text-white rounded-lg px-4 py-1.5 hover:bg-[#011870] transition-colors disabled:opacity-50"
            >
              {loading ? "Đang tải…" : "Áp dụng"}
            </button>
            {isFiltered && (
              <button
                onClick={handleReset}
                disabled={loading}
                className="text-sm font-medium text-slate-500 border border-slate-200 rounded-lg px-4 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {fetchError && (
          <p className="text-sm text-red-600 mb-4">{fetchError}</p>
        )}

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
            Đăng nhập ({visibleLogins.length})
          </button>
          <button
            onClick={() => setTab("lookups")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "lookups"
                ? "border-[#012082] text-[#012082]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Tra cứu GCN ({visibleLookups.length})
          </button>
          <button
            onClick={() => setTab("cancels")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "cancels"
                ? "border-red-600 text-red-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Hủy đơn ({visibleCancels.length})
          </button>
        </div>

        {/* Logins tab */}
        {tab === "logins" && (
          visibleLogins.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Không có dữ liệu.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#012082] text-white text-left">
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Thời gian</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Email</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Kết quả</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Lý do</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(visibleLogins, "logins").map((e) => (
                      <Fragment key={e.id}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><LoginBadge type={e.type} /></td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {e.type === "login_failed" ? e.reason : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => toggleDetail(e.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#012082] transition-colors"
                            >
                              <ChevronIcon open={expandedId === e.id} />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                        {expandedId === e.id && (
                          <DetailPanel event={e} colSpan={5} />
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination forTab="logins" total={visibleLogins.length} />
            </>
          )
        )}

        {/* Lookups tab */}
        {tab === "lookups" && (
          visibleLookups.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Không có dữ liệu.</p>
          ) : (
            <>
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
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(visibleLookups, "lookups").map((e) => (
                      <Fragment key={e.id}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.CERT_NO_hash || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.ACCOUNT_NO_hash || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.IDCARD_hash || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.criteria.PHONE_hash || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <LookupBadge success={e.success} count={e.resultCount} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => toggleDetail(e.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#012082] transition-colors"
                            >
                              <ChevronIcon open={expandedId === e.id} />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                        {expandedId === e.id && (
                          <DetailPanel event={e} colSpan={8} />
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination forTab="lookups" total={visibleLookups.length} />
            </>
          )
        )}

        {/* Cancels tab */}
        {tab === "cancels" && (
          visibleCancels.length === 0 ? (
            <p className="text-slate-400 text-sm py-8 text-center">Không có dữ liệu.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#012082] text-white text-left">
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Thời gian</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Email</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Số chứng nhận</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Kết quả</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap">Lỗi</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(visibleCancels, "cancels").map((e) => (
                      <Fragment key={e.id}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatTime(e.timestamp)}</td>
                          <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{e.email}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{e.certNo || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {e.success
                              ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Thành công</span>
                              : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Thất bại</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[240px]">
                            <span className="line-clamp-1">{e.error || "—"}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => toggleDetail(e.id)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#012082] transition-colors"
                            >
                              <ChevronIcon open={expandedId === e.id} />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                        {expandedId === e.id && (
                          <DetailPanel event={e} colSpan={6} />
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination forTab="cancels" total={visibleCancels.length} />
            </>
          )
        )}
      </div>
    </div>
  );
}
