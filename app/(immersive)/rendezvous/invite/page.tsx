"use client";

/**
 * Rendezvous Invite — 紹介コード入力 + 自分のコード表示 + 招待トークン残高
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ReferralShareCard from "@/components/rendezvous/ReferralShareCard";

type TokenBalance = {
  points: number;
  friendshipTokens: number;
  discoveryTokens: number;
};

export default function InvitePage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") ?? "";
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 招待トークン
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null);
  const [inviteRemaining, setInviteRemaining] = useState<number | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  const fetchTokenData = useCallback(async () => {
    try {
      const res = await fetch("/api/rendezvous/invite");
      if (res.ok) {
        const data = await res.json() as { balance: TokenBalance; inviteRemaining: number };
        setTokenBalance(data.balance);
        setInviteRemaining(data.inviteRemaining);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchTokenData();
  }, [fetchTokenData]);

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

  const handleCreateInvitation = async () => {
    setInviteCreating(true);
    setInviteCode(null);
    try {
      const res = await fetch("/api/rendezvous/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_invitation" }),
      });
      if (res.ok) {
        const data = await res.json() as { inviteCode: string; remaining: number };
        setInviteCode(data.inviteCode);
        setInviteRemaining(data.remaining);
      } else {
        const err = await res.json() as { error: string };
        setResult({ ok: false, message: err.error });
      }
    } catch {
      setResult({ ok: false, message: "エラーが発生しました" });
    }
    setInviteCreating(false);
  };

  const handleConvert = async (tokenType: "friendship" | "discovery") => {
    setConverting(tokenType);
    try {
      const res = await fetch("/api/rendezvous/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert_tokens", tokenType }),
      });
      if (res.ok) {
        const data = await res.json() as { balance: TokenBalance };
        setTokenBalance(data.balance);
      } else {
        const err = await res.json() as { error: string };
        setResult({ ok: false, message: err.error });
      }
    } catch {
      setResult({ ok: false, message: "変換に失敗しました" });
    }
    setConverting(null);
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

        {/* ── 招待トークン残高 ── */}
        {tokenBalance && (
          <div
            style={{
              padding: "20px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(236,253,245,0.7))",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(16,185,129,0.15)",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C", marginBottom: 12 }}>
              招待トークン
            </h2>

            {/* 残高 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{
                flex: 1, padding: "10px", borderRadius: 10,
                background: "rgba(16,185,129,0.06)", textAlign: "center",
              }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                  {tokenBalance.points}
                </p>
                <p style={{ fontSize: 10, color: "rgba(30,30,60,0.5)" }}>ポイント</p>
              </div>
              <div style={{
                flex: 1, padding: "10px", borderRadius: 10,
                background: "rgba(14,165,233,0.06)", textAlign: "center",
              }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#0ea5e9" }}>
                  {tokenBalance.friendshipTokens}
                </p>
                <p style={{ fontSize: 10, color: "rgba(30,30,60,0.5)" }}>Friendship</p>
              </div>
              <div style={{
                flex: 1, padding: "10px", borderRadius: 10,
                background: "rgba(168,85,247,0.06)", textAlign: "center",
              }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#a855f7" }}>
                  {tokenBalance.discoveryTokens}
                </p>
                <p style={{ fontSize: 10, color: "rgba(30,30,60,0.5)" }}>Discovery</p>
              </div>
            </div>

            {/* 変換ボタン */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => handleConvert("friendship")}
                disabled={converting !== null || tokenBalance.points < 100}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: tokenBalance.points >= 100
                    ? "linear-gradient(135deg, #0ea5e9, #06b6d4)"
                    : "rgba(0,0,0,0.05)",
                  color: tokenBalance.points >= 100 ? "#fff" : "rgba(0,0,0,0.3)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  opacity: converting === "friendship" ? 0.5 : 1,
                }}
              >
                {converting === "friendship" ? "変換中..." : "100pt → Friendship"}
              </button>
              <button
                onClick={() => handleConvert("discovery")}
                disabled={converting !== null || tokenBalance.points < 200}
                style={{
                  flex: 1, padding: "8px", borderRadius: 8, border: "none",
                  background: tokenBalance.points >= 200
                    ? "linear-gradient(135deg, #a855f7, #8b5cf6)"
                    : "rgba(0,0,0,0.05)",
                  color: tokenBalance.points >= 200 ? "#fff" : "rgba(0,0,0,0.3)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  opacity: converting === "discovery" ? 0.5 : 1,
                }}
              >
                {converting === "discovery" ? "変換中..." : "200pt → Discovery"}
              </button>
            </div>

            {/* 招待コード生成 */}
            <div style={{
              padding: "12px", borderRadius: 10,
              background: "rgba(5,150,105,0.04)",
              border: "1px solid rgba(5,150,105,0.1)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>
                  招待コードを発行
                </p>
                {inviteRemaining !== null && (
                  <p style={{ fontSize: 10, color: "rgba(30,30,60,0.4)" }}>
                    今月残り {inviteRemaining}回
                  </p>
                )}
              </div>
              <p style={{ fontSize: 10, color: "rgba(30,30,60,0.5)", marginBottom: 8 }}>
                友達が登録するとポイント獲得。Phase到達で追加ポイント。
              </p>
              {inviteCode ? (
                <div style={{ textAlign: "center", padding: "8px" }}>
                  <p style={{
                    fontSize: 18, fontWeight: 800, letterSpacing: 2,
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    color: "#059669",
                  }}>
                    {inviteCode}
                  </p>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(inviteCode);
                    }}
                    style={{
                      marginTop: 6, fontSize: 11, color: "#059669",
                      background: "none", border: "none", cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    コピー
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCreateInvitation}
                  disabled={inviteCreating || (inviteRemaining !== null && inviteRemaining <= 0)}
                  style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: "none",
                    background: (inviteRemaining === null || inviteRemaining > 0)
                      ? "linear-gradient(135deg, #059669, #0d9488)"
                      : "rgba(0,0,0,0.05)",
                    color: (inviteRemaining === null || inviteRemaining > 0) ? "#fff" : "rgba(0,0,0,0.3)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    opacity: inviteCreating ? 0.5 : 1,
                  }}
                >
                  {inviteCreating ? "生成中..." : "招待コードを生成"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* My referral code */}
        <ReferralShareCard />
      </div>
    </div>
  );
}
