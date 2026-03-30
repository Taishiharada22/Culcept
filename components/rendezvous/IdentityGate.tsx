"use client";

/**
 * IdentityGate
 * 本人確認ステータスに基づいてコンテンツをゲートする。
 * romantic / orbiter カテゴリのみ本人確認必須。
 */

import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
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
};

const GATED_CATEGORIES = ["romantic", "orbiter", "partner"];

/** Partner は L3 + review_status=approved が必要。Romance/Orbiter は L2(既存動作)。 */
const PARTNER_REQUIRED_LEVEL = 3;

const stages = [
  { emoji: "\uD83D\uDCE4", label: "書類受領" },
  { emoji: "\uD83D\uDD0D", label: "確認中" },
  { emoji: "\u2728", label: "分身覚醒" },
] as const;

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

  // Pending: show progress + children with banner
  if (status === "pending") {
    return (
      <>
        {/* Progress overlay that can be dismissed */}
        <PendingProgress />
        {/* Children with locked banner */}
        <div style={{ position: "relative" }}>
          <div style={bannerStyle}>
            本人確認の完了までマッチング機能はロックされています
          </div>
          {children}
        </div>
      </>
    );
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
// Pending progress sub-component
// ---------------------------------------------------------------------------
function PendingProgress() {
  const currentStage = 1; // "確認中" for pending status

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(16px)",
        borderRadius: 20,
        padding: "28px 24px",
        border: "1px solid rgba(255,255,255,0.08)",
        marginBottom: 16,
        textAlign: "center",
      }}
    >
      {/* 3-stage progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {stages.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <motion.div
              animate={
                i === currentStage
                  ? { scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }
                  : {}
              }
              transition={
                i === currentStage
                  ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                  : {}
              }
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                opacity: i <= currentStage ? 1 : 0.3,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background:
                    i < currentStage
                      ? "rgba(99,102,241,0.3)"
                      : i === currentStage
                      ? "rgba(99,102,241,0.15)"
                      : "rgba(255,255,255,0.05)",
                  border:
                    i === currentStage
                      ? "2px solid rgba(99,102,241,0.5)"
                      : "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                {s.emoji}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: i === currentStage ? 700 : 500,
                  color:
                    i === currentStage
                      ? "#A5B4FC"
                      : "rgba(255,255,255,0.5)",
                }}
              >
                {s.label}
              </span>
            </motion.div>

            {/* Arrow between stages */}
            {i < stages.length - 1 && (
              <span
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.2)",
                  marginTop: -18,
                }}
              >
                &rarr;
              </span>
            )}
          </div>
        ))}
      </div>

      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.7)",
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        分身があなたを理解する準備をしています...
      </p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        通常24時間以内に完了します
      </p>
    </div>
  );
}
