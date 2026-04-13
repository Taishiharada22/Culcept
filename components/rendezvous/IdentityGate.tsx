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

  // Step definitions for progress stepper
  const steps = [
    { label: "受付済み", done: true, active: false },
    { label: "審査中", done: false, active: true },
    { label: "完了", done: false, active: false },
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "linear-gradient(180deg, #FFF0F3 0%, #FFE0E8 25%, #F8C8D4 50%, #F0B4C4 75%, #E8A0B0 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ===== Layer 1: STATUS HERO + Layer 2: PROGRESS STEPS ===== */}
      <div style={{ padding: "56px 24px 0" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.85)",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          {/* Animated status ring */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              {/* Background ring (inactive) */}
              <svg
                width={80}
                height={80}
                viewBox="0 0 80 80"
                style={{ position: "absolute", top: 0, left: 0 }}
              >
                <circle
                  cx={40}
                  cy={40}
                  r={35}
                  fill="none"
                  stroke="rgba(0,0,0,0.06)"
                  strokeWidth={3}
                />
              </svg>
              {/* Active ring (animated, shows 2/3 progress) */}
              <motion.svg
                width={80}
                height={80}
                viewBox="0 0 80 80"
                style={{ position: "absolute", top: 0, left: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              >
                <circle
                  cx={40}
                  cy={40}
                  r={35}
                  fill="none"
                  stroke="#E91E63"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 35 * 0.55} ${2 * Math.PI * 35 * 0.45}`}
                  style={{ filter: "drop-shadow(0 0 6px rgba(233,30,99,0.35))" }}
                />
              </motion.svg>
              {/* Center content */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 80,
                  height: 80,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 800, color: "#1A1025", lineHeight: 1 }}>
                  2
                </span>
                <span style={{ fontSize: 9, color: "#A8A0B8", marginTop: 1 }}>
                  / 3
                </span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 20px",
              borderRadius: 20,
              background: "#E91E63",
              marginBottom: 16,
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#fff",
              }}
            />
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "0.06em" }}>
              審査中
            </span>
          </motion.div>

          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#1A1025", marginBottom: 6, letterSpacing: "-0.01em" }}>
            書類を受け付けました
          </h2>

          {formattedDate && (
            <p style={{ fontSize: 12, color: "#A8A0B8", marginBottom: 0 }}>
              提出日: {formattedDate}
            </p>
          )}

          {/* --- Progress stepper (inside the same white card) --- */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {/* Horizontal stepper */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                gap: 0,
              }}
            >
              {steps.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 72,
                    }}
                  >
                    {/* Circle indicator */}
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: s.done
                          ? "#E91E63"
                          : s.active
                          ? "#E91E63"
                          : "rgba(0,0,0,0.08)",
                        border: s.active
                          ? "2px solid rgba(233,30,99,0.3)"
                          : "none",
                        boxShadow: s.active
                          ? "0 0 10px rgba(233,30,99,0.3)"
                          : s.done
                          ? "0 0 6px rgba(233,30,99,0.2)"
                          : "none",
                      }}
                    />
                    {/* Label */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: s.active ? 700 : 500,
                        color: s.active
                          ? "#E91E63"
                          : s.done
                          ? "#6B6580"
                          : "#A8A0B8",
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  {/* Connector line */}
                  {i < 2 && (
                    <div
                      style={{
                        width: 40,
                        height: 2,
                        borderRadius: 1,
                        background: s.done
                          ? "rgba(233,30,99,0.4)"
                          : "rgba(0,0,0,0.08)",
                        marginBottom: 24,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Estimated time */}
            <p
              style={{
                fontSize: 12,
                color: "#A8A0B8",
                textAlign: "center",
                marginTop: 14,
                lineHeight: 1.6,
              }}
            >
              通常24時間以内に完了します
            </p>
          </div>
        </div>
      </div>

      {/* ===== Layer 3: VALUE PREVIEW ===== */}
      <div style={{ padding: "28px 24px 0" }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#1A1025",
            letterSpacing: "0.04em",
            marginBottom: 14,
          }}
        >
          承認後にできること
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              icon: "✦",
              color: "#E91E63",
              title: "直感マッチング",
              desc: "写真とフィーリングで、運命の一瞬を掴む",
            },
            {
              icon: "◈",
              color: "#7C4DFF",
              title: "深層スコアリング",
              desc: "45軸の性格分析に基づく、本質的な相性判定",
            },
            {
              icon: "◇",
              color: "#00BCD4",
              title: "AIカウンセラー",
              desc: "関係の深め方を、あなた専用に導く",
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: 16,
                borderRadius: 16,
                background: "rgba(255,255,255,0.75)",
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  color: item.color,
                  flexShrink: 0,
                  lineHeight: 1,
                  marginTop: 0,
                }}
              >
                {item.icon}
              </span>
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1A1025",
                    marginBottom: 3,
                  }}
                >
                  {item.title}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "#6B6580",
                    lineHeight: 1.6,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ===== Layer 4: ALTERNATIVE ACTION ===== */}
      <div style={{ padding: "28px 24px 48px", marginTop: "auto" }}>
        <button
          onClick={() => router.push("/rendezvous/connection")}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "transparent",
            color: "#6B6580",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          つながりを探す
        </button>
      </div>
    </div>
  );
}
