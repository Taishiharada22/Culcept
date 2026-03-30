"use client";

/**
 * AgeVerificationGate
 * 18歳以上の年齢確認が完了するまでコンテンツをブロック
 */

import { useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  isVerified: boolean;
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function AgeVerificationGate({ children, isVerified }: Props) {
  const [year, setYear] = useState<number | "">(""  );
  const [month, setMonth] = useState<number | "">("");
  const [day, setDay] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(isVerified);

  if (verified) return <>{children}</>;

  const days = year && month ? Array.from({ length: daysInMonth(Number(year), Number(month)) }, (_, i) => i + 1) : [];

  const handleSubmit = async () => {
    if (!year || !month || !day) {
      setError("生年月日をすべて選択してください");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const res = await fetch("/api/rendezvous/age-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "確認に失敗しました");
        return;
      }

      setVerified(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(99,102,241,0.15)",
    background: "rgba(255,255,255,0.8)",
    fontSize: 14,
    color: "#1E1E3C",
    outline: "none",
    flex: 1,
    minWidth: 0,
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(30,30,60,0.3)",
        backdropFilter: "blur(12px)",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          borderRadius: 20,
          padding: "32px 24px",
          border: "1px solid rgba(99,102,241,0.1)",
          boxShadow: "0 16px 48px rgba(30,30,60,0.15)",
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 36 }}>🔐</span>
        </div>

        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#1E1E3C",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          年齢確認
        </h2>

        <p
          style={{
            fontSize: 12,
            color: "rgba(30,30,60,0.5)",
            textAlign: "center",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          Rendezvousのご利用には18歳以上であることの確認が必要です。
          <br />
          生年月日を入力してください。
        </p>

        {error && (
          <div
            style={{
              fontSize: 12,
              color: "#EF4444",
              background: "rgba(239,68,68,0.06)",
              padding: "8px 12px",
              borderRadius: 10,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Date selects */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <select
            value={year}
            onChange={(e) => { setYear(e.target.value ? Number(e.target.value) : ""); setDay(""); }}
            style={selectStyle}
          >
            <option value="">年</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>

          <select
            value={month}
            onChange={(e) => { setMonth(e.target.value ? Number(e.target.value) : ""); setDay(""); }}
            style={selectStyle}
          >
            <option value="">月</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>

          <select
            value={day}
            onChange={(e) => setDay(e.target.value ? Number(e.target.value) : "")}
            style={selectStyle}
          >
            <option value="">日</option>
            {days.map((d) => (
              <option key={d} value={d}>{d}日</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !year || !month || !day}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: submitting || !year || !month || !day
              ? "rgba(99,102,241,0.2)"
              : "linear-gradient(135deg, #6366F1, #8B5CF6)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {submitting ? "確認中..." : "確認する"}
        </button>

        <p
          style={{
            fontSize: 10,
            color: "rgba(30,30,60,0.3)",
            textAlign: "center",
            marginTop: 16,
            lineHeight: 1.5,
          }}
        >
          入力された情報は年齢確認のみに使用されます。
        </p>
      </div>
    </div>
  );
}
