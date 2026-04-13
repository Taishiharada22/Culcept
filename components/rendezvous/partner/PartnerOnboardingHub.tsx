"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS, RV_CATEGORY_COLORS, RvCard, RvButton } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import {
  PARTNER_DOCUMENTS,
  computePartnerTrustScore,
  areRequiredDocumentsApproved,
  type PartnerDocumentType,
  type PartnerDocumentStatus,
  type PartnerDocumentStatuses,
} from "@/lib/rendezvous/verificationLevel";

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

type ReviewStatus = "not_submitted" | "pending" | "approved" | "rejected";

type PartnerOnboardingHubProps = {
  reviewStatus?: ReviewStatus;
};

type DocumentStatusMap = Record<PartnerDocumentType, PartnerDocumentStatus>;

export default function PartnerOnboardingHub({ reviewStatus = "not_submitted" }: PartnerOnboardingHubProps) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingProcess, setSyncingProcess] = useState(false);
  const [activeStep, setActiveStep] = useState<"hub" | "lifeplan" | "dealbreaker">("hub");
  const [docStatuses, setDocStatuses] = useState<DocumentStatusMap>({
    identity: reviewStatus === "approved" ? "approved" : reviewStatus === "pending" ? "pending" : reviewStatus === "rejected" ? "rejected" : "not_submitted",
    single_status: "not_submitted",
    income: "not_submitted",
    education: "not_submitted",
    employment: "not_submitted",
  });

  const fetchDocumentStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/rendezvous/partner/documents");
      if (!res.ok) return;
      const data = await res.json();
      if (data.documents) {
        const map: DocumentStatusMap = {
          identity: "not_submitted",
          single_status: "not_submitted",
          income: "not_submitted",
          education: "not_submitted",
          employment: "not_submitted",
        };
        for (const doc of data.documents) {
          if (doc.type in map) {
            map[doc.type as PartnerDocumentType] = doc.status;
          }
        }
        setDocStatuses(map);
      }
    } catch (err) {
      console.error("[PartnerHub] document status fetch error:", err);
    }
  }, []);

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
    fetchDocumentStatuses();
  }, [fetchProgress, fetchDocumentStatuses]);

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

  const partnerDocStatuses: PartnerDocumentStatuses = {
    single_status: docStatuses.single_status,
    income: docStatuses.income,
    education: docStatuses.education,
    employment: docStatuses.employment,
  };
  const requiredDocsApproved = areRequiredDocumentsApproved(
    docStatuses.identity === "approved" ? "approved"
      : docStatuses.identity === "pending" ? "pending"
      : docStatuses.identity === "rejected" ? "rejected"
      : "not_submitted",
    partnerDocStatuses,
  );
  const trustScore = computePartnerTrustScore(
    docStatuses.identity === "approved" ? "approved" : "not_submitted",
    partnerDocStatuses,
  );

  const allReady = progress &&
    progress.lifePlan.completionRate >= 0.5 &&
    progress.dealbreaker.filledCount >= 4 &&
    progress.processProfile.synced &&
    (progress.processProfile.axisCoverage ?? 0) >= SUFFICIENCY_THRESHOLD &&
    requiredDocsApproved;

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
              人生を共にする人との出会いを、4つのステップで準備する
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

            {/* Step 4: 本人確認・書類提出 */}
            <FadeInView delay={0.35}>
              <PartnerDocumentChecklist
                docStatuses={docStatuses}
                trustScore={trustScore}
                onRefresh={fetchDocumentStatuses}
              />
            </FadeInView>

            {/* Trust explanation */}
            <FadeInView delay={0.4}>
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
            <FadeInView delay={0.45}>
              <div style={{ marginTop: 8, textAlign: "center", paddingBottom: 16 }}>
                {allReady ? (
                  <Link href="/rendezvous/partner/candidates" style={{ textDecoration: "none" }}>
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
                    ステップ1〜4を全て完了すると、パートナー候補が生成されます。<br />
                    Life Plan は50%以上、絶対条件は4項目以上、<br />
                    本人確認書類と独身証明書の承認が必要です。
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

// ── PartnerDocumentChecklist ──

const DOC_ICONS: Record<PartnerDocumentType, string> = {
  identity: "\u{1F4CB}",   // clipboard
  single_status: "\u{1F4CB}",
  income: "\u{1F4B0}",     // money bag
  education: "\u{1F393}",  // graduation cap
  employment: "\u{1F4BC}", // briefcase
};

function PartnerDocumentChecklist({
  docStatuses,
  trustScore,
  onRefresh,
}: {
  docStatuses: DocumentStatusMap;
  trustScore: number;
  onRefresh: () => void;
}) {
  const [uploadingType, setUploadingType] = useState<PartnerDocumentType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTypeRef = useRef<PartnerDocumentType | null>(null);

  // Compute required docs progress
  const requiredDocs = PARTNER_DOCUMENTS.filter((d) => d.required);
  const optionalDocs = PARTNER_DOCUMENTS.filter((d) => !d.required);
  const requiredApprovedCount = requiredDocs.filter((d) => docStatuses[d.type] === "approved").length;
  const allRequiredApproved = requiredDocs.every((d) => docStatuses[d.type] === "approved");
  const anyInProgress = PARTNER_DOCUMENTS.some(
    (d) => docStatuses[d.type] === "pending" || (d.required && docStatuses[d.type] !== "not_submitted" && docStatuses[d.type] !== "approved"),
  );
  const hasRequiredMissing = requiredDocs.some(
    (d) => docStatuses[d.type] === "not_submitted" || docStatuses[d.type] === "rejected",
  );

  const stepStatus: "pending" | "in_progress" | "completed" = allRequiredApproved
    ? "completed"
    : anyInProgress
      ? "in_progress"
      : "pending";

  const stepColor = stepStatus === "completed" ? "#00C853" : stepStatus === "in_progress" ? PARTNER_COLOR : RV_COLORS.textMuted;
  const requiredProgressPercent = requiredApprovedCount / requiredDocs.length;

  const handleUploadClick = (type: PartnerDocumentType) => {
    if (type === "identity") {
      window.location.href = "/rendezvous/romance";
      return;
    }
    pendingTypeRef.current = type;
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const type = pendingTypeRef.current;
    if (!file || !type) return;

    setUploadingType(type);
    try {
      const fd = new FormData();
      fd.append("documentType", type);
      fd.append("documentImage", file);

      const res = await fetch("/api/rendezvous/partner/documents", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("[PartnerDocChecklist] upload error:", data.error);
      }
    } catch (err) {
      console.error("[PartnerDocChecklist] upload error:", err);
    } finally {
      setUploadingType(null);
      pendingTypeRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: RV_COLORS.surface,
        border: stepStatus !== "pending"
          ? `1px solid ${stepColor}25`
          : `1px solid ${RV_COLORS.border}`,
        boxShadow: `0 4px 20px ${RV_COLORS.shadow}`,
      }}
    >
      <div className="flex">
        {/* Accent bar */}
        <div
          style={{
            width: 3,
            flexShrink: 0,
            background: stepStatus === "completed"
              ? `linear-gradient(180deg, #00C853 0%, #00C85340 100%)`
              : stepStatus === "in_progress"
                ? `linear-gradient(180deg, ${PARTNER_COLOR} 0%, ${PARTNER_COLOR}40 100%)`
                : RV_COLORS.surfaceMuted,
            borderRadius: "3px 0 0 3px",
          }}
        />

        <div style={{ flex: 1, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            {/* Number circle */}
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: stepStatus === "completed"
                ? "#00C853"
                : stepStatus === "in_progress"
                  ? PARTNER_COLOR
                  : RV_COLORS.surfaceMuted,
              color: stepStatus !== "pending" ? "#fff" : RV_COLORS.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: stepStatus === "completed" ? 15 : 14,
              fontWeight: 700,
              fontFamily: '"Noto Serif JP", serif',
              flexShrink: 0,
            }}>
              {stepStatus === "completed" ? "\u2713" : 4}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <h3 style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: RV_COLORS.text,
                  fontFamily: '"Noto Serif JP", serif',
                  margin: 0,
                }}>
                  本人確認・書類提出
                </h3>
              </div>

              <p style={{
                fontSize: 12,
                color: RV_COLORS.textSub,
                lineHeight: 1.7,
                marginBottom: 16,
              }}>
                結婚相談所水準の書類確認で、安全な出会いを保証します
              </p>

              {/* ===== Alert banner when required docs are missing ===== */}
              {hasRequiredMissing && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <span style={{
                    fontSize: 14,
                    flexShrink: 0,
                    marginTop: 1,
                    color: "#EF4444",
                  }}>!</span>
                  <span style={{
                    fontSize: 12,
                    color: "#EF4444",
                    lineHeight: 1.6,
                    fontWeight: 500,
                  }}>
                    必須書類が未提出です — 候補閲覧には全ての必須書類の承認が必要です
                  </span>
                </div>
              )}

              {/* ===== Required documents section ===== */}
              <div style={{ marginBottom: 20 }}>
                {/* Required header with progress */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: PARTNER_COLOR,
                    letterSpacing: "0.04em",
                  }}>
                    必須書類 ({requiredApprovedCount}/{requiredDocs.length} 完了)
                  </span>
                </div>

                {/* Required progress bar */}
                <div style={{
                  height: 3,
                  borderRadius: 2,
                  background: RV_COLORS.surfaceMuted,
                  overflow: "hidden",
                  marginBottom: 12,
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${requiredProgressPercent * 100}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      background: allRequiredApproved ? "#00C853" : PARTNER_COLOR,
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {requiredDocs.map((doc) => (
                    <DocumentRow
                      key={doc.type}
                      doc={doc}
                      status={docStatuses[doc.type]}
                      uploading={uploadingType === doc.type}
                      onAction={() => handleUploadClick(doc.type)}
                    />
                  ))}
                </div>
              </div>

              {/* ===== Divider ===== */}
              <div style={{
                height: 1,
                background: RV_COLORS.border,
                marginBottom: 16,
              }} />

              {/* ===== Optional documents section ===== */}
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: RV_COLORS.textMuted,
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}>
                  任意書類 — 提出すると信頼度が上がります
                </div>
                <div style={{
                  fontSize: 10,
                  color: RV_COLORS.textMuted,
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}>
                  候補者に優先表示されます
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {optionalDocs.map((doc) => (
                    <DocumentRow
                      key={doc.type}
                      doc={doc}
                      status={docStatuses[doc.type]}
                      uploading={uploadingType === doc.type}
                      onAction={() => handleUploadClick(doc.type)}
                      muted
                    />
                  ))}
                </div>
              </div>

              {/* ===== Divider ===== */}
              <div style={{
                height: 1,
                background: RV_COLORS.border,
                marginBottom: 16,
              }} />

              {/* ===== Trust score ===== */}
              <div style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: RV_COLORS.surfaceMuted,
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}>
                  <span style={{ fontSize: 12, color: RV_COLORS.textSub, fontWeight: 700 }}>
                    信頼スコア
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 16,
                          color: i < trustScore ? "#F59E0B" : "#D1D5DB",
                        }}
                      >
                        {i < trustScore ? "\u2605" : "\u2606"}
                      </span>
                    ))}
                    <span style={{ fontSize: 12, color: RV_COLORS.textMuted, marginLeft: 6, fontWeight: 700 }}>
                      {trustScore}/5
                    </span>
                  </div>
                </div>
                <p style={{
                  fontSize: 11,
                  color: RV_COLORS.textMuted,
                  lineHeight: 1.5,
                  margin: 0,
                }}>
                  書類を多く提出するほど、相手からの信頼度が上がります
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for document uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
    </div>
  );
}

// ── DocumentRow ──

function DocumentRow({
  doc,
  status,
  uploading,
  onAction,
  muted,
}: {
  doc: { type: PartnerDocumentType; label: string; description: string; required: boolean };
  status: PartnerDocumentStatus;
  uploading: boolean;
  onAction: () => void;
  muted?: boolean;
}) {
  const isActionable = (status === "not_submitted" || status === "rejected") && !uploading;

  // Status badge config
  const badgeConfig: Record<PartnerDocumentStatus, { label: string; color: string; bg: string; border: string }> = {
    not_submitted: {
      label: "\u672A\u63D0\u51FA",
      color: "#EF4444",
      bg: "transparent",
      border: "1px solid #EF4444",
    },
    pending: {
      label: "\u5BE9\u67FB\u4E2D",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.1)",
      border: "1px solid rgba(245,158,11,0.2)",
    },
    approved: {
      label: "\u2713 \u627F\u8A8D\u6E08\u307F",
      color: "#10B981",
      bg: "rgba(16,185,129,0.1)",
      border: "1px solid rgba(16,185,129,0.2)",
    },
    rejected: {
      label: "\u518D\u63D0\u51FA",
      color: "#EF4444",
      bg: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.2)",
    },
  };
  const badge = badgeConfig[status];

  // Card background/border per status
  const cardBg = status === "approved"
    ? "rgba(16,185,129,0.04)"
    : status === "rejected"
      ? "rgba(239,68,68,0.04)"
      : status === "pending"
        ? "rgba(245,158,11,0.04)"
        : muted
          ? "rgba(0,0,0,0.015)"
          : "rgba(255,255,255,0.06)";

  const cardBorder = status === "approved"
    ? "1px solid rgba(16,185,129,0.15)"
    : status === "rejected"
      ? "1px solid rgba(239,68,68,0.15)"
      : status === "pending"
        ? "1px solid rgba(245,158,11,0.15)"
        : `1px solid ${RV_COLORS.border}`;

  return (
    <div
      style={{
        padding: muted ? "12px 14px" : "14px 16px",
        borderRadius: 12,
        background: cardBg,
        border: cardBorder,
      }}
    >
      {/* Top row: icon + name + badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: muted ? 14 : 16, flexShrink: 0 }}>
          {DOC_ICONS[doc.type]}
        </span>
        <span style={{
          fontSize: muted ? 13 : 14,
          fontWeight: 700,
          color: muted && status === "not_submitted" ? RV_COLORS.textSub : RV_COLORS.text,
          fontFamily: '"Noto Serif JP", serif',
          flex: 1,
          minWidth: 0,
        }}>
          {doc.label}
        </span>

        {/* Status badge */}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: badge.color,
          padding: "3px 10px",
          borderRadius: 8,
          background: badge.bg,
          border: badge.border,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {badge.label}
        </span>
      </div>

      {/* Description */}
      <p style={{
        fontSize: 12,
        color: RV_COLORS.textMuted,
        lineHeight: 1.5,
        margin: 0,
        paddingLeft: muted ? 24 : 26,
      }}>
        {doc.description}
      </p>

      {/* Action button row */}
      {(isActionable || uploading) && (
        <div style={{ paddingLeft: muted ? 24 : 26, marginTop: 10 }}>
          {uploading ? (
            <span style={{
              display: "inline-block",
              fontSize: 12,
              fontWeight: 600,
              color: PARTNER_COLOR,
              padding: "6px 16px",
              borderRadius: 8,
              background: `${PARTNER_COLOR}0C`,
              border: `1px solid ${PARTNER_COLOR}20`,
            }}>
              送信中...
            </span>
          ) : status === "rejected" ? (
            <button
              onClick={onAction}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#EF4444",
                padding: "7px 18px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid rgba(239,68,68,0.4)",
                cursor: "pointer",
                fontFamily: '"Noto Serif JP", serif',
              }}
            >
              再提出する
            </button>
          ) : (
            <button
              onClick={onAction}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                padding: "7px 18px",
                borderRadius: 8,
                background: PARTNER_COLOR,
                border: "none",
                cursor: "pointer",
                fontFamily: '"Noto Serif JP", serif',
                boxShadow: `0 2px 8px ${PARTNER_COLOR}40`,
              }}
            >
              提出する
            </button>
          )}
        </div>
      )}
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
