"use client";

/**
 * Rendezvous Invite — 紹介コード入力 + 自分のコード表示
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ReferralShareCard from "@/components/rendezvous/ReferralShareCard";

export default function InvitePage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClaim = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/rendezvous/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      setResult({ ok: data.ok, message: data.message ?? data.error });
    } catch {
      setResult({ ok: false, message: "エラーが発生しました" });
    }
    setSubmitting(false);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #F8F7FF 0%, #FFF0F5 50%, #E8FFFE 100%)",
        padding: "20px",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <Link
          href="/rendezvous"
          style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", textDecoration: "none" }}
        >
          ← Rendezvous
        </Link>

        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1E1E3C", marginTop: 8, marginBottom: 20 }}>
          招待
        </h1>

        {/* Claim code section */}
        <div
          style={{
            padding: "20px",
            borderRadius: 16,
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(99,102,241,0.08)",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C", marginBottom: 8 }}>
            紹介コードを入力
          </h2>
          <p style={{ fontSize: 11, color: "rgba(30,30,60,0.5)", marginBottom: 12 }}>
            友達から受け取ったコードを入力してください
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="RDV-XXXXXXXX"
              maxLength={12}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(99,102,241,0.12)",
                background: "rgba(255,255,255,0.8)",
                fontSize: 14,
                fontWeight: 600,
                color: "#1E1E3C",
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
                letterSpacing: 1,
                outline: "none",
                textTransform: "uppercase",
              }}
            />
            <button
              onClick={handleClaim}
              disabled={!code.trim() || submitting}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #6366F1, #A855F7)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: submitting ? "wait" : "pointer",
                opacity: !code.trim() || submitting ? 0.5 : 1,
              }}
            >
              適用
            </button>
          </div>

          {result && (
            <p
              style={{
                fontSize: 12,
                color: result.ok ? "#22C55E" : "#EF4444",
                marginTop: 8,
                fontWeight: 600,
              }}
            >
              {result.message}
            </p>
          )}
        </div>

        {/* My referral code */}
        <ReferralShareCard />
      </div>
    </div>
  );
}
