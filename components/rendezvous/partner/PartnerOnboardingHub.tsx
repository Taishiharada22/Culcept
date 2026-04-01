"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvCard, RvButton } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

/**
 * Partner オンボーディング Hub
 *
 * 「結婚前提の交際」であることを明示し、
 * Life Plan 質問 + Dealbreaker 設定 + Process Profile の3ステップを管理する。
 *
 * Visual Identity: Structured, trustworthy, concierge-quality, serious
 */

const PARTNER_COLOR = RV_CATEGORY_COLORS.partner; // テラコッタコーラル

type ProgressData = {
  lifePlan: { completionRate: number; answeredCount: number; totalQuestions: number };
  dealbreaker: { completed: boolean; filledCount: number; totalFields: number };
  processProfile: { synced: boolean; axisCoverage?: number };
};

const STATUS_LABELS: Record<string, string> = {
  pending: "未着手",
  in_progress: "進行中",
  completed: "完了",
};

export default function PartnerOnboardingHub() {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingProcess, setSyncingProcess] = useState(false);
  const [activeStep, setActiveStep] = useState<"hub" | "lifeplan" | "dealbreaker">("hub");

  const fetchProgress = useCallback(async () => {
    try {
      const [lpRes, ppRes] = await Promise.all([
        fetch("/api/rendezvous/partner/life-plan"),
        fetch("/api/rendezvous/partner/process-profile"),
      ]);
      const lpData = lpRes.ok ? await lpRes.json() : null;
      const ppData = ppRes.ok ? await ppRes.json() : null;

      // Dealbreaker は profile_details からチェック
      const dbRes = await fetch("/api/rendezvous/settings");
      const dbData = dbRes.ok ? await dbRes.json() : null;
      const pd = dbData?.profile?.profile_details ?? {};
      const dbFields = ["marriageIntent", "childrenPreference", "smokingStatus", "smokingTolerance", "preferredPrefectures", "religionImportance"];
      const filledCount = dbFields.filter((f) => pd[f] !== undefined && pd[f] !== null && pd[f] !== "").length;

      setProgress({
        lifePlan: {
          completionRate: lpData?.progress?.completionRate ?? 0,
          answeredCount: lpData?.progress?.answeredCount ?? 0,
          totalQuestions: lpData?.progress?.totalQuestions ?? 38,
        },
        dealbreaker: {
          completed: filledCount >= 4, // 4/6 以上で完了とみなす
          filledCount,
          totalFields: dbFields.length,
        },
        processProfile: {
          synced: !!ppData?.processProfile,
          axisCoverage: ppData?.axisCoverage ?? 0,
        },
      });
    } catch (err) {
      console.error("[PartnerHub] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const handleSyncProcess = async () => {
    setSyncingProcess(true);
    try {
      await fetch("/api/rendezvous/partner/process-profile", { method: "POST" });
      await fetchProgress();
    } catch {
      // ignore
    } finally {
      setSyncingProcess(false);
    }
  };

  if (activeStep === "lifeplan") {
    return (
      <LifePlanFlow onBack={() => { setActiveStep("hub"); fetchProgress(); }} />
    );
  }

  if (activeStep === "dealbreaker") {
    return (
      <DealbreakerFlow onBack={() => { setActiveStep("hub"); fetchProgress(); }} />
    );
  }

  // 充足率 30% = RELATIONSHIP_AXES 35軸中 11軸以上。
  // Four Horsemen 4次元 × 各2〜4入力軸 = 最低8〜10軸が必要で、
  // 加えて Conflict Style に最低1軸必要なため 11軸（≈30%）を下限とした。
  const SUFFICIENCY_THRESHOLD = 0.3;

  const allReady = progress &&
    progress.lifePlan.completionRate >= 0.5 &&
    progress.dealbreaker.filledCount >= 4 &&
    progress.processProfile.synced &&
    (progress.processProfile.axisCoverage ?? 0) >= SUFFICIENCY_THRESHOLD;

  return (
    <div
      className="min-h-screen pb-20"
      style={{
        background: `linear-gradient(180deg, ${RV_COLORS.base} 0%, rgba(212,119,107,0.03) 60%, ${RV_COLORS.base} 100%)`,
      }}
    >
      {/* ===== Top gradient border accent ===== */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${PARTNER_COLOR}60 0%, ${PARTNER_COLOR} 50%, ${PARTNER_COLOR}60 100%)`,
        }}
      />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 24px" }}>
        {/* ===== Hero Header ===== */}
        <FadeInView delay={0}>
          <div style={{ textAlign: "center", paddingTop: 32, paddingBottom: 8 }}>
            {/* Shield badge */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${PARTNER_COLOR}18 0%, ${PARTNER_COLOR}08 100%)`,
                border: `2px solid ${PARTNER_COLOR}25`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 20, color: PARTNER_COLOR }}>♦</span>
            </div>

            {/* Title */}
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: RV_COLORS.text,
                fontFamily: '"Noto Serif JP", serif',
                letterSpacing: "0.08em",
                marginBottom: 12,
              }}
            >
              パートナー
            </h1>

            {/* Subtitle */}
            <p
              style={{
                fontSize: 14,
                color: RV_COLORS.textSub,
                lineHeight: 1.8,
                fontFamily: '"Noto Serif JP", serif',
                maxWidth: 340,
                margin: "0 auto 24px",
              }}
            >
              人生を共にする人との出会いを、3つのステップで準備する
            </p>
          </div>
        </FadeInView>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: RV_COLORS.textMuted }}>
            読み込み中...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Step 1: Life Plan 質問 */}
            <FadeInView delay={0.1}>
              <StepCard
                number={1}
                title="人生設計の観測"
                description="金銭感覚・家族計画・キャリア観など8つの軸で、あなたの価値観を深く観測します"
                status={
                  (progress?.lifePlan.completionRate ?? 0) >= 1
                    ? "completed"
                    : (progress?.lifePlan.answeredCount ?? 0) > 0
                      ? "in_progress"
                      : "pending"
                }
                progressLabel={`${progress?.lifePlan.answeredCount ?? 0} / ${progress?.lifePlan.totalQuestions ?? 38} 問`}
                progressPercent={progress?.lifePlan.completionRate ?? 0}
                onAction={() => setActiveStep("lifeplan")}
                actionLabel={(progress?.lifePlan.answeredCount ?? 0) > 0 ? "続ける" : "はじめる"}
              />
            </FadeInView>

            {/* Step 2: Dealbreaker 設定 */}
            <FadeInView delay={0.2}>
              <StepCard
                number={2}
                title="絶対条件の設定"
                description="結婚意向・子ども・喫煙・居住地域・宗教など、譲れない条件を設定します"
                status={
                  (progress?.dealbreaker.completed)
                    ? "completed"
                    : (progress?.dealbreaker.filledCount ?? 0) > 0
                      ? "in_progress"
                      : "pending"
                }
                progressLabel={`${progress?.dealbreaker.filledCount ?? 0} / ${progress?.dealbreaker.totalFields ?? 6} 項目`}
                progressPercent={(progress?.dealbreaker.filledCount ?? 0) / (progress?.dealbreaker.totalFields ?? 6)}
                onAction={() => setActiveStep("dealbreaker")}
                actionLabel={(progress?.dealbreaker.filledCount ?? 0) > 0 ? "編集する" : "設定する"}
              />
            </FadeInView>

            {/* Step 3: Process Profile 同期 */}
            <FadeInView delay={0.3}>
              <StepCard
                number={3}
                title="関係性プロファイルの同期"
                description="Stargazer の観測データから、対話パターン・葛藤解決スタイル・修復力を自動算出します"
                status={
                  progress?.processProfile.synced
                    ? (progress.processProfile.axisCoverage ?? 0) >= SUFFICIENCY_THRESHOLD ? "completed"
                      : "in_progress"
                    : "pending"
                }
                progressLabel={
                  progress?.processProfile.synced
                    ? (progress.processProfile.axisCoverage ?? 0) >= SUFFICIENCY_THRESHOLD
                      ? `同期済み（データ充足率 ${Math.round((progress.processProfile.axisCoverage ?? 0) * 100)}%）`
                      : (progress.processProfile.axisCoverage ?? 0) > 0
                        ? `同期済み・観測不足（充足率 ${Math.round((progress.processProfile.axisCoverage ?? 0) * 100)}%）`
                        : "同期済み・Stargazer 観測データなし"
                    : "未同期"
                }
                progressPercent={progress?.processProfile.axisCoverage ?? 0}
                onAction={handleSyncProcess}
                actionLabel={syncingProcess ? "同期中..." : progress?.processProfile.synced ? "再同期" : "同期する"}
                disabled={syncingProcess}
              />
            </FadeInView>

            {/* Trust explanation */}
            <FadeInView delay={0.35}>
              <div
                style={{
                  marginTop: 8,
                  padding: "16px 20px",
                  borderRadius: 14,
                  background: RV_COLORS.surface,
                  border: `1px solid ${RV_COLORS.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: PARTNER_COLOR,
                    letterSpacing: "0.05em",
                    marginBottom: 10,
                  }}
                >
                  この仕組みが安心な理由
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { icon: "◎", text: "価値観・ライフプラン・対話スタイルの3軸で深く分析" },
                    { icon: "◎", text: "全ての候補は本人確認を経た方のみ" },
                    { icon: "◎", text: "AIカウンセラーが関係構築を伴走" },
                    { icon: "◎", text: "深層レポート・相性シミュレーションを全て閲覧可能" },
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: PARTNER_COLOR,
                          fontWeight: 600,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {item.icon}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: RV_COLORS.textSub,
                          lineHeight: 1.6,
                        }}
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </FadeInView>

            {/* CTA */}
            <FadeInView delay={0.4}>
              <div style={{ marginTop: 8, textAlign: "center", paddingBottom: 16 }}>
                {allReady ? (
                  <Link href="/rendezvous" style={{ textDecoration: "none" }}>
                    <RvButton
                      className="w-full"
                      onClick={() => {}}
                    >
                      候補を見る
                    </RvButton>
                  </Link>
                ) : (
                  <p style={{
                    fontSize: 12,
                    color: RV_COLORS.textMuted,
                    lineHeight: 1.6,
                    fontFamily: '"Noto Serif JP", serif',
                  }}>
                    ステップ1〜3を進めると、パートナー候補が生成されます。<br />
                    Life Plan は50%以上、絶対条件は4項目以上が必要です。
                  </p>
                )}
              </div>
            </FadeInView>
          </div>
        )}
      </div>
    </div>
  );
}

// ── StepCard ──

function StepCard({
  number,
  title,
  description,
  status,
  progressLabel,
  progressPercent,
  onAction,
  actionLabel,
  disabled,
}: {
  number: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  progressLabel: string;
  progressPercent: number;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
}) {
  const statusColors = {
    pending: RV_COLORS.textMuted,
    in_progress: PARTNER_COLOR,
    completed: "#00C853",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: RV_COLORS.surface,
        border: status !== "pending"
          ? `1px solid ${statusColors[status]}25`
          : `1px solid ${RV_COLORS.border}`,
        boxShadow: `0 4px 20px ${RV_COLORS.shadow}`,
      }}
    >
      {/* Left accent line via inner wrapper */}
      <div className="flex">
        {/* Accent bar */}
        <div
          style={{
            width: 3,
            flexShrink: 0,
            background: status === "completed"
              ? `linear-gradient(180deg, #00C853 0%, #00C85340 100%)`
              : status === "in_progress"
                ? `linear-gradient(180deg, ${PARTNER_COLOR} 0%, ${PARTNER_COLOR}40 100%)`
                : RV_COLORS.surfaceMuted,
            borderRadius: "3px 0 0 3px",
          }}
        />

        <div style={{ flex: 1, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            {/* Number circle — serif font */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: status === "completed"
                ? "#00C853"
                : status === "in_progress"
                  ? PARTNER_COLOR
                  : RV_COLORS.surfaceMuted,
              color: status !== "pending" ? "#fff" : RV_COLORS.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: '"Noto Serif JP", serif',
              flexShrink: 0,
            }}>
              {status === "completed" ? "✓" : number}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title + Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <h3 style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: RV_COLORS.text,
                  fontFamily: '"Noto Serif JP", serif',
                  margin: 0,
                }}>
                  {title}
                </h3>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: statusColors[status],
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: `${statusColors[status]}10`,
                    letterSpacing: "0.03em",
                  }}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>

              <p style={{
                fontSize: 12,
                color: RV_COLORS.textSub,
                lineHeight: 1.7,
                marginBottom: 14,
              }}>
                {description}
              </p>

              {/* Progress bar */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}>
                  <span style={{ fontSize: 11, color: RV_COLORS.textMuted }}>
                    {progressLabel}
                  </span>
                  <span style={{ fontSize: 11, color: statusColors[status], fontWeight: 600 }}>
                    {Math.round(progressPercent * 100)}%
                  </span>
                </div>
                <div style={{
                  height: 4,
                  borderRadius: 2,
                  background: RV_COLORS.surfaceMuted,
                  overflow: "hidden",
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      background: statusColors[status],
                    }}
                  />
                </div>
              </div>

              <button
                onClick={onAction}
                disabled={disabled}
                style={{
                  padding: "9px 22px",
                  borderRadius: 10,
                  border: `1px solid ${PARTNER_COLOR}30`,
                  background: status === "pending" ? "transparent" : `${PARTNER_COLOR}0C`,
                  color: PARTNER_COLOR,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: '"Noto Serif JP", serif',
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  letterSpacing: "0.02em",
                }}
              >
                {actionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Life Plan Flow (内部遷移) ──

import LifePlanQuestionnaire from "./LifePlanQuestionnaire";

function LifePlanFlow({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button
        onClick={onBack}
        style={{
          padding: "14px 20px",
          background: "none",
          border: "none",
          color: RV_COLORS.textSub,
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        準備に戻る
      </button>
      <LifePlanQuestionnaire />
    </div>
  );
}

// ── Dealbreaker Flow (内部遷移) ──

import DealbreakerSettings from "./DealbreakerSettings";

function DealbreakerFlow({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <button
        onClick={onBack}
        style={{
          padding: "14px 20px",
          background: "none",
          border: "none",
          color: RV_COLORS.textSub,
          fontSize: 13,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        準備に戻る
      </button>
      <DealbreakerSettings />
    </div>
  );
}
