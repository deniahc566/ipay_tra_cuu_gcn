"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ResultsTable } from "./ResultsTable";
import { EmptyState } from "./EmptyState";
import type { VbiRecord } from "@/types/vbi";

type SearchState = "initial" | "loading" | "results" | "no-results" | "error";

export function SearchForm({ userEmail }: { userEmail: string }) {
  const [fields, setFields] = useState({
    CERT_NO: "",
    ACCOUNT_NO: "",
    IDCARD: "",
    PHONE_NUMBER: "",
  });
  const [validationError, setValidationError] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("initial");
  const [records, setRecords] = useState<VbiRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  function handleChange(field: keyof typeof fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setFields((prev) => ({ ...prev, [field]: e.target.value }));
      setValidationError("");
    };
  }

  function handleReset() {
    setFields({ CERT_NO: "", ACCOUNT_NO: "", IDCARD: "", PHONE_NUMBER: "" });
    setSearchState("initial");
    setRecords([]);
    setErrorMessage("");
    setValidationError("");
  }

  async function doSearch(searchFields: typeof fields) {
    setSearchState("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/insurance/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchFields),
      });
      const data = await res.json();

      if (!data.success) {
        setErrorMessage(data.error ?? "Đã xảy ra lỗi.");
        setSearchState("error");
        return;
      }

      if (!data.data || data.data.length === 0) {
        setSearchState("no-results");
        setRecords([]);
      } else {
        setRecords(data.data);
        setSearchState("results");
      }
    } catch {
      setErrorMessage("Không thể kết nối đến hệ thống. Vui lòng thử lại.");
      setSearchState("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasAny = Object.values(fields).some((v) => v.trim() !== "");
    if (!hasAny) {
      setValidationError("Vui lòng nhập ít nhất một điều kiện tìm kiếm.");
      return;
    }
    await doSearch(fields);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Search card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">
          Thông tin tra cứu
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="cert-no"
              label="Số chứng nhận"
              placeholder="VD: BPXB2GCFA26"
              value={fields.CERT_NO}
              onChange={handleChange("CERT_NO")}
            />
            <Input
              id="account-no"
              label="Số tài khoản"
              placeholder="Số tài khoản ngân hàng"
              value={fields.ACCOUNT_NO}
              onChange={handleChange("ACCOUNT_NO")}
            />
            <Input
              id="idcard"
              label="CCCD / CMND"
              placeholder="VD: 012345678901"
              value={fields.IDCARD}
              onChange={handleChange("IDCARD")}
            />
            <Input
              id="phone"
              label="Số điện thoại"
              placeholder="VD: 0901234567"
              value={fields.PHONE_NUMBER}
              onChange={handleChange("PHONE_NUMBER")}
            />
          </div>

          {validationError && (
            <div className="mt-4">
              <Alert type="error" message={validationError} />
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <Button type="submit" loading={searchState === "loading"} className="flex-1 sm:flex-none sm:min-w-[140px]">
              Tra cứu
            </Button>
            {searchState !== "initial" && (
              <Button type="button" variant="secondary" onClick={handleReset}>
                Làm mới
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Results area */}
      {searchState === "initial" && <EmptyState type="initial" />}
      {searchState === "no-results" && <EmptyState type="no-results" />}
      {searchState === "error" && <EmptyState type="error" message={errorMessage} />}
      {searchState === "results" && (
        <div>
          <p className="text-sm text-slate-500 mb-3">
            Tìm thấy <span className="font-semibold text-slate-700">{records.length}</span> kết quả
          </p>
          <ResultsTable
            records={records}
            onCancelSuccess={() => doSearch(fields)}
            userEmail={userEmail}
          />
        </div>
      )}
    </div>
  );
}
