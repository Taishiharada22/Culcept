"use client";

/**
 * IdentityGate
 * 本人確認ステータスに基づいてコンテンツをゲートする。
 * romantic / orbiter カテゴリのみ本人確認必須。
 */

import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AvatarBirthFlow from "./AvatarBirthFlow";
import {
  trackRomanceGateView,
  trackRomanceGatePass,
  trackPartnerGateBlock,
} from "@/lib/rendezvous/trackRendezvous";

/**
 * verification_status: ユーザー向け到達状態
 *   unverified=未確認, pending=確認中, verified=確認済み, rejected=却下, expired=期限切れ
 *
 * review_status: 管理側審査状態
 *   not_submitted=未提出, pending=審査中, approved=承認, rejected=却下
 */
type VStatus = "unverified" | "pending" | "verified" | "rejected" | "expired";
type RStatus = "not_submitted" | "pending" | "approved" | "rejected";

type Props = {
  children: ReactNode;
  /** verification_status（ユーザー向け到達状態） */
  verificationStatus: VStatus;
  categories: string[];
  rejectionNote?: string | null;
  /** verification_level (0-4) */
  verificationLevel?: number;
  /** review_status（管理側審査状態） */
  reviewStatus?: RStatus;
  /** 書類提出日（ISO string） */
  submittedAt?: string | null;
  /** アカウント凍結中か */
  isFrozen?: boolean;
  /** 凍結理由（内部用、ユーザーには非表示） */
  frozenReason?: string | null;
};

const GATED_CATEGORIES = ["romantic", "orbiter", "partner"];

/** Partner は L3 + review_status=approved が必要。Romance/Orbiter は L2(既存動作)。 */
const PARTNER_REQUIRED_LEVEL = 3;

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 150,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(10,10,25,0.65)",
  backdropFilter: "blur(8px)",
  padding: 16,
};

const cardStyle: CSSProperties = {
  maxWidth: 400,
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  borderRadius: 24,
  padding: "32px 24px",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
  textAlign: "center",
};

const bannerStyle: CSSProperties = {
  background: "rgba(251,191,36,0.1)",
  border: "1px solid rgba(251,191,36,0.2)",
  borderRadius: 12,
  padding: "10px 16px",
  marginBottom: 16,
  fontSize: 13,
  color: "rgba(251,191,36,0.9)",
  fontWeight: 600,
  textAlign: "center",
};

export default function IdentityGate({
  children,
  verificationStatus,
  categories,
  rejectionNote,
  verificationLevel = 0,
  reviewStatus = "not_submitted",
  submittedAt,
  isFrozen = false,
  frozenReason: _frozenReason,
}: Props) {
  const [showBirthFlow, setShowBirthFlow] = useState(false);
  const [status, setStatus] = useState<VStatus>(verificationStatus);

  const needsGate = categories.some((c) => GATED_CATEGORIES.includes(c));
  const isPartner = categories.includes("partner");
  const isRomantic = categories.includes("romantic");

  // Determine gate outcome for tracking
  const gateBlocked = needsGate && (
    (isPartner && !(verificationLevel >= PARTNER_REQUIRED_LEVEL && reviewStatus === "approved")) ||
    (!isPartner && status !== "verified")
  );

  // Analytics: track gate view/pass/block once on mount
  useEffect(() => {
    if (!needsGate) return;
    if (isRomantic && gateBlocked) {
      trackRomanceGateView();
    }
    if (isRomantic && !gateBlocked) {
      trackRomanceGatePass();
    }
    if (isPartner && gateBlocked) {
      trackPartnerGateBlock(verificationLevel, PARTNER_REQUIRED_LEVEL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No gate needed for non-gated categories
  if (!needsGate) return <>{children}</>;

  // 凍結中: 全ゲート対象カテゴリをブロック
  if (isFrozen) {
    return <FrozenAccountScreen />;
  }

  // Partner 用: L3 + review_status=approved が必要
  if (isPartner) {
    if (verificationLevel >= PARTNER_REQUIRED_LEVEL && reviewStatus === "approved") {
      return <>{children}</>;
    }
    // L3 未満、または review_status != approved の場合はゲート
    // (以下の既存フローで pending/rejected/none を処理)
  }

  // Romance/Orbiter: 既存動作（verified で通過）
  if (!isPartner && status === "verified") return <>{children}</>;

  // Show AvatarBirthFlow for unverified status or when user clicks resubmit
  if (status === "unverified" || showBirthFlow) {
    return (
      <AvatarBirthFlow
        onComplete={() => {
          setShowBirthFlow(false);
          setStatus("pending");
        }}
      />
    );
  }

  // Pending: ロックされた恋愛レーン（期待を保ったままロック）
  if (status === "pending") {
    return <LockedRomanceLane submittedAt={submittedAt} />;
  }

  // Rejected
  if (status === "rejected") {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>&#x26A0;&#xFE0F;</div>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#fff",
              marginBottom: 12,
            }}
          >
            本人確認が承認されませんでした
          </h2>

          {rejectionNote && (
            <div
              style={{
                background: "rgba(239,68,68,0.08)",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 20,
                border: "1px solid rgba(239,68,68,0.15)",
              }}
            >
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6 }}>
                {rejectionNote}
              </p>
            </div>
          )}

          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.5)",
              marginBottom: 24,
              lineHeight: 1.7,
            }}
          >
            書類を再提出して本人確認をやり直すことができます
          </p>

          <button
            onClick={() => setShowBirthFlow(true)}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            再提出
          </button>
        </div>
      </div>
    );
  }

  // Fallback
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// FrozenAccountScreen — 凍結中のユーザーに表示
// ---------------------------------------------------------------------------
function FrozenAccountScreen() {
  const router = useRouter();

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.7 }}>⏸</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 12 }}>
          ご利用を一時停止しています
        </h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 24, lineHeight: 1.7 }}>
          現在この機能はご利用いただけません。
          <br />
          詳細は通知をご確認ください。
        </p>
        <button
          onClick={() => router.push("/rendezvous")}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Rendezvous に戻る
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LockedRomanceLane — 期待を保ったままロックする審査中画面
// ---------------------------------------------------------------------------
function LockedRomanceLane({ submittedAt }: { submittedAt?: string | null }) {
  const router = useRouter();
  const formattedDate = submittedAt
    ? new Date(submittedAt).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "linear-gradient(180deg, rgba(233,30,99,0.03) 0%, rgba(10,10,25,1) 40%)",
      }}
    >
      {/* ステータスカード */}
      <div style={{ padding: "48px 24px 0" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
            borderRadius: 20,
            padding: "28px 24px",
            border: "1px solid rgba(255,255,255,0.08)",
            textAlign: "center",
          }}
        >
          {/* ステータスインジケータ */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#FBBF24",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#FBBF24", letterSpacing: "0.04em" }}>
              審査中
            </span>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
            書類を受け付けました
          </h2>

          {formattedDate && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
              提出日: {formattedDate}
            </p>
          )}

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
            通常は24時間以内に確認しています。
            <br />
            混雑時はもう少しお時間をいただくことがあります。
          </p>

          {/* 3ステップ：受付済み → 審査中 → 完了 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0,
              marginTop: 24,
              padding: "16px 0 4px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {[
              { label: "受付済み", done: true },
              { label: "審査中", active: true },
              { label: "完了", done: false },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: s.done
                        ? "rgba(99,102,241,0.4)"
                        : s.active
                        ? "rgba(251,191,36,0.2)"
                        : "rgba(255,255,255,0.05)",
                      border: s.active
                        ? "1.5px solid rgba(251,191,36,0.5)"
                        : s.done
                        ? "1.5px solid rgba(99,102,241,0.5)"
                        : "1px solid rgba(255,255,255,0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                    }}
                  >
                    {s.done ? "✓" : s.active ? "…" : ""}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: s.active ? 700 : 500,
                      color: s.active ? "#FBBF24" : s.done ? "rgba(165,180,252,0.8)" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    style={{
                      width: 32,
                      height: 1,
                      background: s.done
                        ? "rgba(99,102,241,0.3)"
                        : "rgba(255,255,255,0.08)",
                      marginBottom: 20,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 恋愛レーンの世界観プレビュー */}
      <div style={{ padding: "32px 24px 0" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(233,30,99,0.7)", letterSpacing: "0.08em", marginBottom: 16 }}>
          承認後に待っている体験
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { icon: "✦", title: "直感マッチング", desc: "写真とフィーリングで、運命の一瞬を掴む" },
            { icon: "◈", title: "深層スコアリング", desc: "45軸の性格分析に基づく、本質的な相性判定" },
            { icon: "◇", title: "AIカウンセラー", desc: "関係の深め方を、あなた専用に導く" },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "14px 16px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span style={{ fontSize: 16, color: "rgba(233,30,99,0.6)", flexShrink: 0, marginTop: 1 }}>
                {item.icon}
              </span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                  {item.title}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 控えめなつながり誘導 */}
      <div style={{ padding: "32px 24px 48px", marginTop: "auto" }}>
        <button
          onClick={() => router.push("/rendezvous/connection")}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 12,
            border: "1px solid rgba(123,97,255,0.15)",
            background: "rgba(123,97,255,0.05)",
            color: "rgba(123,97,255,0.7)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          審査の間、つながりで出会いを広げる
        </button>
      </div>
    </div>
  );
}
