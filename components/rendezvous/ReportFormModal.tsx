"use client";

/**
 * ReportFormModal
 * Rendezvous通報フォームモーダル
 * 理由選択 + 詳細テキスト + 送信
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const REPORT_REASONS = [
  { value: "inappropriate_photo", label: "不適切な写真" },
  { value: "fake_profile", label: "なりすまし・偽プロフィール" },
  { value: "harassment", label: "嫌がらせ・暴言" },
  { value: "spam", label: "スパム・商業目的" },
  { value: "underage", label: "未成年の疑い" },
  { value: "other", label: "その他" },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]["value"];

type Props = {
  candidateId: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function ReportFormModal({
  candidateId,
  onClose,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, detail: detail.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "送信に失敗しました");
        return;
      }

      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }, [candidateId, reason, detail, onSubmitted]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            width: "100%",
            maxWidth: 400,
            borderRadius: 20,
            background: "#fff",
            boxShadow: "0 8px 40px rgba(30,30,60,0.15)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 20px 12px",
              borderBottom: "1px solid rgba(30,30,60,0.06)",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "#1E1E3C",
                margin: 0,
              }}
            >
              通報する
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "rgba(30,30,60,0.45)",
                margin: "6px 0 0",
                lineHeight: 1.5,
              }}
            >
              不適切な行為を報告してください。内容を確認し、適切に対応いたします。
            </p>
          </div>

          {submitted ? (
            /* Success state */
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "rgba(0,200,83,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 24,
                }}
              >
                &#x2713;
              </div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#1E1E3C",
                  margin: "0 0 8px",
                }}
              >
                通報を受け付けました
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(30,30,60,0.5)",
                  margin: "0 0 20px",
                  lineHeight: 1.6,
                }}
              >
                確認後、適切に対応いたします。
              </p>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 24px",
                  borderRadius: 10,
                  border: "1px solid rgba(30,30,60,0.08)",
                  background: "rgba(255,255,255,0.8)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "rgba(30,30,60,0.6)",
                }}
              >
                閉じる
              </button>
            </div>
          ) : (
            /* Form */
            <div style={{ padding: "16px 20px 20px" }}>
              {/* Reason selection */}
              <div style={{ marginBottom: 16 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(30,30,60,0.5)",
                    marginBottom: 8,
                    letterSpacing: 0.5,
                  }}
                >
                  通報理由
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {REPORT_REASONS.map((r) => (
                    <label
                      key={r.value}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border:
                          reason === r.value
                            ? "1px solid rgba(220,38,38,0.2)"
                            : "1px solid rgba(30,30,60,0.06)",
                        background:
                          reason === r.value
                            ? "rgba(220,38,38,0.03)"
                            : "rgba(255,255,255,0.6)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        style={{
                          accentColor: "#DC2626",
                          margin: 0,
                          width: 16,
                          height: 16,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color:
                            reason === r.value
                              ? "#DC2626"
                              : "rgba(30,30,60,0.7)",
                        }}
                      >
                        {r.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Detail textarea */}
              <div style={{ marginBottom: 16 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(30,30,60,0.5)",
                    marginBottom: 6,
                    letterSpacing: 0.5,
                  }}
                >
                  詳細（任意）
                </p>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="詳細を入力してください"
                  maxLength={500}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(30,30,60,0.08)",
                    background: "rgba(248,247,255,0.6)",
                    fontSize: 13,
                    color: "#1E1E3C",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(220,38,38,0.06)",
                    fontSize: 12,
                    color: "#DC2626",
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  {error}
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    borderRadius: 10,
                    border: "1px solid rgba(30,30,60,0.08)",
                    background: "rgba(255,255,255,0.8)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "rgba(30,30,60,0.5)",
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!reason || submitting}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    borderRadius: 10,
                    border: "none",
                    cursor: !reason || submitting ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    background:
                      !reason || submitting
                        ? "rgba(220,38,38,0.3)"
                        : "#DC2626",
                    boxShadow:
                      reason && !submitting
                        ? "0 2px 8px rgba(220,38,38,0.2)"
                        : "none",
                    opacity: submitting ? 0.6 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {submitting ? "送信中..." : "通報する"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
