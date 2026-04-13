"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { WeeklyBriefing } from "@/lib/rendezvous/counselor/weeklyBriefing";
import type { ActiveConnectionItem, GrowthInsight, GrowthPattern } from "@/lib/rendezvous/counselor/types";
import type { ExchangeRecord } from "@/lib/rendezvous/exchangeProtocol";
import type { RendezvousAccessLevel } from "@/lib/rendezvous/phaseGate";
import type { CoupleGame } from "@/lib/rendezvous/coupleGames";
import type { MissionTemplate } from "@/lib/rendezvous/missionTemplates";

// ============================================================
// Counselor Dashboard
//
// Partnerタブの最上位に表示されるCounselorダッシュボード。
// Alterとの差別化:
//   Alter  = チャット形式・amber/gold・内省的
//   Counselor = ダッシュボード形式・emerald/teal・構造的・専門的
// ============================================================

interface CounselorDashboardProps {
  /** PartnerTierを持つかどうか（持たない場合はアップグレード促進を表示） */
  hasPartnerTier: boolean;
  /** Phase Gate によるアクセスレベル */
  accessLevel?: RendezvousAccessLevel;
}

type ConsultState = "idle" | "open" | "sending" | "replied";

type PacingGuidance = {
  severity: "significant" | "critical";
  delta: number;
  guidance: string;
  suggestedAction: string;
};

type CounselorRecommendationItem = {
  candidateId: string;
  counterpartUserId: string;
  type: string;
  reason: string;
  priority: string;
  game: CoupleGame | null;
  mission: MissionTemplate | null;
  pacing: PacingGuidance | null;
};

type SelfDiscoveryFeedbackEntry = {
  questions?: Array<{
    question: string;
    category: string;
  }>;
  gapDetection?: {
    hasGap: boolean;
    gapDescription: string | null;
    gapQuestion: string | null;
  } | null;
  counselorNote?: string;
  createdAt: string;
};

export default function CounselorDashboard({
  hasPartnerTier,
  accessLevel = "none",
}: CounselorDashboardProps) {
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [connections, setConnections] = useState<ActiveConnectionItem[]>([]);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // 成長インサイト
  const [growthInsight, setGrowthInsight] = useState<GrowthInsight | null>(null);

  // Exchange
  const [exchanges, setExchanges] = useState<ExchangeRecord[]>([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  // Self-Discovery Feedback（直近の問い）
  const [recentFeedbacks, setRecentFeedbacks] = useState<SelfDiscoveryFeedbackEntry[]>([]);

  // Counselor推薦アクション
  const [recommendations, setRecommendations] = useState<CounselorRecommendationItem[]>([]);

  // 安全警告
  const [safetyAlerts, setSafetyAlerts] = useState<Array<{
    candidateId: string;
    action: string;
    signalTypes: string[];
    maxSeverity: number;
    detectedAt: string;
  }>>([]);

  // Honest Exit Rate
  const [honestExitRate, setHonestExitRate] = useState<{
    ratePercent: number;
    totalDisconnects: number;
    honestExits: number;
  } | null>(null);

  // 相談シート
  const [consultState, setConsultState] = useState<ConsultState>("idle");
  const [consultQuestion, setConsultQuestion] = useState("");
  const [consultReply, setConsultReply] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRegenerate = false) => {
    try {
      const [briefingRes, connectionsRes, growthRes, exchangeRes, sdFeedbackRes, exitRateRes, recRes] = await Promise.all([
        fetch(
          `/api/rendezvous/counselor/weekly-briefing${forceRegenerate ? "?forceRegenerate=true" : ""}`,
        ),
        fetch("/api/rendezvous/counselor/active-connections"),
        fetch("/api/rendezvous/counselor/growth"),
        fetch("/api/rendezvous/counselor/exchange"),
        fetch("/api/rendezvous/counselor/self-discovery-feedback"),
        fetch("/api/rendezvous/counselor/honest-exit-rate"),
        fetch("/api/rendezvous/counselor/recommendation"),
      ]);

      const briefingData = await briefingRes.json() as { briefing: WeeklyBriefing };
      const connectionsData = await connectionsRes.json() as { connections: ActiveConnectionItem[] };
      const growthData = await growthRes.json() as { insights: GrowthInsight };
      const exchangeData = await exchangeRes.json() as { exchanges: ExchangeRecord[]; unacknowledgedCount: number };
      const sdFeedbackData = await sdFeedbackRes.json() as { feedbacks: SelfDiscoveryFeedbackEntry[] };
      const exitRateData = await exitRateRes.json() as {
        metrics: { ratePercent: number; totalDisconnects: number; honestExits: number };
      };
      const recData = await recRes.json() as {
        recommendations: CounselorRecommendationItem[];
        safetyAlerts: Array<{
          candidateId: string;
          action: string;
          signalTypes: string[];
          maxSeverity: number;
          detectedAt: string;
        }>;
      };

      setBriefing(briefingData.briefing ?? null);
      setConnections(connectionsData.connections ?? []);
      setGrowthInsight(growthData.insights ?? null);
      setExchanges(exchangeData.exchanges ?? []);
      setUnacknowledgedCount(exchangeData.unacknowledgedCount ?? 0);
      setRecentFeedbacks(sdFeedbackData.feedbacks ?? []);
      setRecommendations(recData.recommendations ?? []);
      setSafetyAlerts(recData.safetyAlerts ?? []);
      if (exitRateData?.metrics) {
        setHonestExitRate(exitRateData.metrics);
      }
    } catch (err) {
      console.error("[CounselorDashboard] fetch error:", err);
    } finally {
      setIsLoadingBriefing(false);
      setIsRegenerating(false);
    }
  }, []);

  useEffect(() => {
    if (hasPartnerTier) {
      void fetchData();
    } else {
      setIsLoadingBriefing(false);
    }
  }, [hasPartnerTier, fetchData]);

  const handleRegenerate = () => {
    setIsRegenerating(true);
    void fetchData(true);
  };

  const handleConsultSubmit = async () => {
    if (!consultQuestion.trim()) return;
    setConsultState("sending");
    try {
      const res = await fetch("/api/rendezvous/counselor/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: consultQuestion }),
      });
      const data = await res.json() as { reply: string };
      setConsultReply(data.reply ?? null);
      setConsultState("replied");
    } catch {
      setConsultState("open");
    }
  };

  const handleAcknowledge = async (exchangeId: string) => {
    try {
      await fetch("/api/rendezvous/counselor/exchange", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeId }),
      });
      // 確認済みに更新
      setExchanges((prev) =>
        prev.map((ex) =>
          ex.id === exchangeId ? { ...ex, acknowledged: true } : ex,
        ),
      );
      setUnacknowledgedCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("[CounselorDashboard] acknowledge error:", err);
    }
  };

  // Partner未加入の場合
  if (!hasPartnerTier) {
    return <UpgradePrompt />;
  }

  return (
    <div className="space-y-4">
      {/* ── ヘッダー ── */}
      <CounselorHeader />

      {/* ── 安全警告（最優先表示） ── */}
      {safetyAlerts.length > 0 && (
        <SafetyAlertSection alerts={safetyAlerts} />
      )}

      {/* ── 今週のブリーフィング ── */}
      <WeeklyBriefingSection
        briefing={briefing}
        isLoading={isLoadingBriefing}
        isRegenerating={isRegenerating}
        onRegenerate={handleRegenerate}
      />

      {/* ── アクティブ接続カード ── */}
      {connections.length > 0 && (
        <ActiveConnectionsSection connections={connections} />
      )}

      {/* ── Counselor推薦アクション ── */}
      {recommendations.length > 0 && (
        <RecommendationSection recommendations={recommendations} />
      )}

      {/* ── 自己発見フィードバック ── */}
      {recentFeedbacks.length > 0 && (
        <SelfDiscoverySection feedbacks={recentFeedbacks} />
      )}

      {/* ── 累積パターン分析 ── */}
      {growthInsight && growthInsight.patterns.length > 0 && (
        <CumulativePatternSection insight={growthInsight} />
      )}

      {/* ── カウンセラーに相談する ── */}
      <ConsultSection
        consultState={consultState}
        consultQuestion={consultQuestion}
        consultReply={consultReply}
        onOpen={() => setConsultState("open")}
        onClose={() => {
          setConsultState("idle");
          setConsultQuestion("");
          setConsultReply(null);
        }}
        onRestart={() => {
          setConsultQuestion("");
          setConsultReply(null);
          setConsultState("open");
        }}
        onQuestionChange={setConsultQuestion}
        onSubmit={handleConsultSubmit}
      />

      {/* ── Exchange更新通知（Phase 4+ のみ） ── */}
      {accessLevel === "full_exchange" && (
        <ExchangeSection
          exchanges={exchanges}
          unacknowledgedCount={unacknowledgedCount}
          onAcknowledge={handleAcknowledge}
        />
      )}

      {/* ── Honest Exit Rate ── */}
      {honestExitRate && honestExitRate.totalDisconnects > 0 && (
        <HonestExitRateSection metrics={honestExitRate} />
      )}
    </div>
  );
}

// ── ヘッダー ──

function CounselorHeader() {
  return (
    <FadeInView direction="down" delay={0}>
      <div className="flex items-center gap-3 px-1">
        {/* Counselorアイコン（Alterのアバターとは明確に別） */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #059669, #0d9488)",
            boxShadow: "0 2px 12px rgba(5,150,105,0.3)",
          }}
        >
          <span className="text-white text-sm font-bold">C</span>
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
            Rendezvous Counselor
          </p>
          <h2 className="text-base font-semibold text-slate-800 leading-tight">
            専属カウンセラー
          </h2>
        </div>
      </div>
    </FadeInView>
  );
}

// ── 安全警告セクション ──

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  message_escalation: "メッセージ頻度の急増",
  rapid_like_all: "大量一括いいね",
  multiple_reports: "複数ユーザーからの通報",
  ghosting_pattern: "ゴースティング傾向",
  boundary_violation: "境界線の逸脱",
  obsessive_viewing: "反復閲覧",
};

const ACTION_LABELS: Record<string, { label: string; severity: "warning" | "danger" }> = {
  warn: { label: "注意", severity: "warning" },
  hold: { label: "一時停止中", severity: "danger" },
  block: { label: "ブロック済み", severity: "danger" },
};

function SafetyAlertSection({ alerts }: { alerts: Array<{
  candidateId: string;
  action: string;
  signalTypes: string[];
  maxSeverity: number;
  detectedAt: string;
}> }) {
  return (
    <FadeInView direction="down" delay={0.05}>
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const actionInfo = ACTION_LABELS[alert.action] ?? ACTION_LABELS.warn;
          return (
            <GlassCard
              key={`${alert.candidateId}-${i}`}
              padding="none"
              hoverEffect={false}
              className="overflow-hidden"
              style={{
                background: actionInfo.severity === "danger"
                  ? "rgba(239,68,68,0.06)"
                  : "rgba(251,191,36,0.06)",
                border: actionInfo.severity === "danger"
                  ? "1px solid rgba(239,68,68,0.2)"
                  : "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <div className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: actionInfo.severity === "danger"
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(251,191,36,0.15)",
                      }}
                    >
                      <span className="text-[10px]">
                        {actionInfo.severity === "danger" ? "!" : "⚠"}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-600">
                      安全シグナル検出
                    </span>
                  </div>
                  <GlassBadge variant={actionInfo.severity} size="sm">
                    {actionInfo.label}
                  </GlassBadge>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {alert.signalTypes
                    .map((t) => SIGNAL_TYPE_LABELS[t] ?? t)
                    .join("、")}
                  が検出されました。
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(alert.detectedAt).toLocaleString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </FadeInView>
  );
}

// ── 今週のブリーフィング ──

interface WeeklyBriefingSectionProps {
  briefing: WeeklyBriefing | null;
  isLoading: boolean;
  isRegenerating: boolean;
  onRegenerate: () => void;
}

function WeeklyBriefingSection({
  briefing,
  isLoading,
  isRegenerating,
  onRegenerate,
}: WeeklyBriefingSectionProps) {
  if (isLoading) {
    return (
      <FadeInView direction="up" delay={0.1}>
        <GlassCard
          padding="none"
          hoverEffect={false}
          className="overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(236,253,245,0.6) 100%)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="h-1 bg-gradient-to-r from-emerald-400/50 via-teal-400/40 to-emerald-400/50" />
          <div className="p-5 space-y-3 animate-pulse">
            <div className="h-4 bg-emerald-100 rounded w-1/3" />
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-4/5" />
          </div>
        </GlassCard>
      </FadeInView>
    );
  }

  if (!briefing) {
    return null;
  }

  const generatedDate = new Date(briefing.generatedAt).toLocaleDateString(
    "ja-JP",
    { month: "numeric", day: "numeric" },
  );

  return (
    <FadeInView direction="up" delay={0.1}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(236,253,245,0.65) 100%)",
          border: "1px solid rgba(16,185,129,0.2)",
        }}
      >
        {/* Emeraldのトップアクセント（Alterのamberと明確に異なる） */}
        <div className="h-1 bg-gradient-to-r from-emerald-400/60 via-teal-400/50 to-emerald-400/60" />

        <div className="p-5 space-y-4">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.span
                className="text-emerald-600 text-base"
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 4 }}
              >
                ◆
              </motion.span>
              <span className="text-sm font-semibold text-slate-700">
                今週の見立て
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{generatedDate}更新</span>
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="text-xs text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors"
              >
                {isRegenerating ? "生成中..." : "更新"}
              </button>
            </div>
          </div>

          {/* 週テーマ */}
          <GlassBadge variant="success" size="sm">
            {briefing.weeklyTheme}
          </GlassBadge>

          {/* Counselorメッセージ */}
          <div
            className="rounded-xl px-4 py-3.5"
            style={{
              background:
                "linear-gradient(135deg, rgba(236,253,245,0.8), rgba(204,251,241,0.5))",
              border: "1px solid rgba(16,185,129,0.15)",
            }}
          >
            <p className="text-sm leading-relaxed text-emerald-900 font-medium">
              {briefing.counselorMessage}
            </p>
          </div>

          {/* 観察リスト */}
          {briefing.observations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                観察
              </p>
              <ul className="space-y-1.5">
                {briefing.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0 text-xs">▸</span>
                    <span className="leading-relaxed">{obs}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 推奨アクション */}
          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: "rgba(5,150,105,0.06)",
              border: "1px solid rgba(5,150,105,0.12)",
            }}
          >
            <p className="text-xs font-medium text-emerald-700 mb-1">
              今週のアクション
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {briefing.recommendedAction}
            </p>
          </div>

          {/* スコア表示 */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">成長スコア</span>
              <span className="text-sm font-bold text-emerald-600">
                {briefing.growthScore}
              </span>
            </div>
            {briefing.activeConnectionCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">接続中</span>
                <span className="text-sm font-bold text-teal-600">
                  {briefing.activeConnectionCount}件
                </span>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ── アクティブ接続カード ──

interface ActiveConnectionsSectionProps {
  connections: ActiveConnectionItem[];
}

function ActiveConnectionsSection({ connections }: ActiveConnectionsSectionProps) {
  return (
    <FadeInView direction="up" delay={0.2}>
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-1">
          進行中の接続
        </p>
        <div className="space-y-2">
          {connections.map((conn) => (
            <ConnectionCard key={conn.candidateId} connection={conn} />
          ))}
        </div>
      </div>
    </FadeInView>
  );
}

function ConnectionCard({ connection }: { connection: ActiveConnectionItem }) {
  const dayLabel =
    connection.daysSinceLastActivity === 0
      ? "今日"
      : connection.daysSinceLastActivity === 1
        ? "昨日"
        : `${connection.daysSinceLastActivity}日前`;

  const isStale = (connection.daysSinceLastActivity ?? 0) >= 3;

  return (
    <GlassCard
      padding="none"
      hoverEffect={false}
      className="overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.7)",
        border: isStale
          ? "1px solid rgba(251,191,36,0.3)"
          : "1px solid rgba(16,185,129,0.15)",
      }}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* アバタープレースホルダー（アバター先行型の原則） */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #e0f2fe, #bae6fd)",
              border: "1px solid rgba(14,165,233,0.2)",
            }}
          >
            <span className="text-sky-500 text-xs">★</span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              {connection.statusLabel}
            </p>
            <p className="text-xs text-slate-400">最終活動: {dayLabel}</p>
          </div>
        </div>
        {isStale && (
          <GlassBadge variant="warning" size="sm">
            間隔あり
          </GlassBadge>
        )}
      </div>
    </GlassCard>
  );
}

// ── Counselor推薦アクション ──

const RECOMMENDATION_TYPE_LABELS: Record<string, string> = {
  suggest_game: "ゲーム提案",
  suggest_mission: "ミッション提案",
  trigger_nudge: "きっかけ作り",
  adjust_pacing: "ペース調整",
  flag_escalation: "要注意",
  celebrate_milestone: "マイルストーン",
  highlight_crystal: "結晶発見",
  suggest_ceremony: "セレモニー",
};

const RECOMMENDATION_PRIORITY_STYLES: Record<string, { bg: string; border: string; badge: "warning" | "danger" | "info" | "secondary" }> = {
  critical: { bg: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", badge: "danger" },
  high: { bg: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)", badge: "warning" },
  medium: { bg: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", badge: "info" },
  low: { bg: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.15)", badge: "secondary" },
};

function RecommendationSection({ recommendations }: { recommendations: CounselorRecommendationItem[] }) {
  const [nudgeSent, setNudgeSent] = useState<Record<string, boolean>>({});
  const [nudgeSending, setNudgeSending] = useState<Record<string, boolean>>({});

  const handleNudge = async (candidateId: string) => {
    setNudgeSending((prev) => ({ ...prev, [candidateId]: true }));
    try {
      const res = await fetch("/api/rendezvous/counselor/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger_nudge", candidateId }),
      });
      const data = await res.json() as { dispatched: boolean };
      if (data.dispatched) {
        setNudgeSent((prev) => ({ ...prev, [candidateId]: true }));
      }
    } catch {
      // fail silently
    } finally {
      setNudgeSending((prev) => ({ ...prev, [candidateId]: false }));
    }
  };

  return (
    <FadeInView direction="up" delay={0.25}>
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide px-1">
          カウンセラーの提案
        </p>
        <div className="space-y-2">
          {recommendations.map((rec) => {
            const style = RECOMMENDATION_PRIORITY_STYLES[rec.priority] ?? RECOMMENDATION_PRIORITY_STYLES.low;
            return (
              <GlassCard
                key={rec.candidateId}
                padding="none"
                hoverEffect={false}
                className="overflow-hidden"
                style={{ background: style.bg, border: style.border }}
              >
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: "linear-gradient(135deg, #059669, #0d9488)",
                        }}
                      >
                        <span className="text-white text-[10px] font-bold">C</span>
                      </div>
                      <span className="text-xs font-medium text-slate-600">
                        {RECOMMENDATION_TYPE_LABELS[rec.type] ?? rec.type}
                      </span>
                    </div>
                    <GlassBadge variant={style.badge} size="sm">
                      {rec.priority === "critical" ? "緊急" : rec.priority === "high" ? "重要" : rec.priority === "medium" ? "推奨" : "参考"}
                    </GlassBadge>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {rec.reason}
                  </p>
                  {/* ゲーム推薦がある場合 */}
                  {rec.game && (
                    <div
                      className="rounded-lg p-3 mt-1"
                      style={{
                        background: "rgba(16,185,129,0.06)",
                        border: "1px solid rgba(16,185,129,0.12)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{rec.game.icon}</span>
                        <span className="text-sm font-medium text-slate-700">
                          {rec.game.titleJa}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {rec.game.descriptionJa}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {rec.game.duration}分 · {rec.game.format === "simultaneous_answer" ? "同時回答" : rec.game.format === "turn_based" ? "交互" : rec.game.format === "collaborative" ? "共同作業" : "チャレンジ"}
                      </p>
                    </div>
                  )}
                  {/* ミッション推薦がある場合 */}
                  {rec.mission && (
                    <div
                      className="rounded-lg p-3 mt-1"
                      style={{
                        background: "rgba(99,102,241,0.06)",
                        border: "1px solid rgba(99,102,241,0.12)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{rec.mission.icon}</span>
                        <span className="text-sm font-medium text-slate-700">
                          {rec.mission.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {rec.mission.description}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {rec.mission.turnsRequired}ターン · {Math.round(rec.mission.timeoutMinutes / 60)}時間制限
                      </p>
                    </div>
                  )}
                  {/* マイルストーン祝福 */}
                  {rec.type === "celebrate_milestone" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="rounded-xl p-4 mt-1 text-center space-y-2"
                      style={{
                        background: "linear-gradient(135deg, rgba(251,191,36,0.1), rgba(245,158,11,0.05), rgba(252,211,77,0.08))",
                        border: "1px solid rgba(251,191,36,0.25)",
                        boxShadow: "0 2px 12px rgba(251,191,36,0.08)",
                      }}
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="text-2xl"
                      >
                        ✦
                      </motion.div>
                      <p className="text-sm font-medium text-amber-700 leading-relaxed">
                        {rec.reason}
                      </p>
                      <p className="text-[10px] text-amber-500/70">
                        Counselor が二人の歩みを祝福しています
                      </p>
                    </motion.div>
                  )}
                  {/* セレモニー提案 */}
                  {rec.type === "suggest_ceremony" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="rounded-xl p-4 mt-1 text-center space-y-2"
                      style={{
                        background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(236,72,153,0.05))",
                        border: "1px solid rgba(139,92,246,0.2)",
                        boxShadow: "0 2px 16px rgba(139,92,246,0.08)",
                      }}
                    >
                      <p className="text-sm font-medium text-violet-700 leading-relaxed">
                        {rec.reason}
                      </p>
                      <a
                        href={`/rendezvous/${rec.candidateId}/graduation`}
                        className="inline-block mt-1 text-xs font-medium px-4 py-2 rounded-lg text-white"
                        style={{
                          background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
                        }}
                      >
                        セレモニーを始める
                      </a>
                    </motion.div>
                  )}
                  {/* 結晶ハイライト */}
                  {rec.type === "highlight_crystal" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="rounded-xl p-4 mt-1 space-y-2"
                      style={{
                        background: "linear-gradient(135deg, rgba(14,165,233,0.06), rgba(16,185,129,0.04))",
                        border: "1px solid rgba(14,165,233,0.2)",
                        boxShadow: "0 2px 12px rgba(14,165,233,0.06)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <motion.span
                          className="text-sky-500 text-lg"
                          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        >
                          ◇
                        </motion.span>
                        <span className="text-sm font-medium text-sky-700">
                          結晶発見
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {rec.reason}
                      </p>
                      <p className="text-[10px] text-sky-500/70">
                        二人の会話から特別な瞬間が結晶化しました
                      </p>
                    </motion.div>
                  )}
                  {/* ペーシングガイダンス */}
                  {rec.pacing && (
                    <div
                      className="rounded-lg p-3 mt-1 space-y-1.5"
                      style={{
                        background: rec.pacing.severity === "critical"
                          ? "rgba(239,68,68,0.05)"
                          : "rgba(251,191,36,0.05)",
                        border: rec.pacing.severity === "critical"
                          ? "1px solid rgba(239,68,68,0.15)"
                          : "1px solid rgba(251,191,36,0.15)",
                      }}
                    >
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {rec.pacing.guidance}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {rec.pacing.suggestedAction}
                      </p>
                    </div>
                  )}
                  {/* ナッジ送信ボタン */}
                  {rec.type === "trigger_nudge" && (
                    <div className="pt-1">
                      {nudgeSent[rec.candidateId] ? (
                        <p className="text-xs text-emerald-600 font-medium">
                          きっかけメッセージを予約しました
                        </p>
                      ) : (
                        <GlassButton
                          variant="secondary"
                          size="sm"
                          onClick={() => handleNudge(rec.candidateId)}
                          disabled={nudgeSending[rec.candidateId]}
                          className="!text-xs"
                        >
                          {nudgeSending[rec.candidateId] ? "送信中..." : "きっかけを送る"}
                        </GlassButton>
                      )}
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </FadeInView>
  );
}

// ── カウンセラーに相談する ──

interface ConsultSectionProps {
  consultState: ConsultState;
  consultQuestion: string;
  consultReply: string | null;
  onOpen: () => void;
  onClose: () => void;
  onRestart: () => void;
  onQuestionChange: (v: string) => void;
  onSubmit: () => void;
}

function ConsultSection({
  consultState,
  consultQuestion,
  consultReply,
  onOpen,
  onClose,
  onRestart,
  onQuestionChange,
  onSubmit,
}: ConsultSectionProps) {
  return (
    <FadeInView direction="up" delay={0.3}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.65)",
          border: "1px solid rgba(16,185,129,0.15)",
        }}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-sm">💬</span>
              <span className="text-sm font-semibold text-slate-700">
                カウンセラーに相談する
              </span>
            </div>
            {consultState !== "idle" && (
              <button
                onClick={onClose}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                閉じる
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {consultState === "idle" && (
              <motion.div
                key="cta"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                <p className="text-xs text-slate-500 leading-relaxed">
                  関係のこと、判断に迷うこと、何でも相談できます。
                  私はあなたのデータをもとに、構造的な視点で応答します。
                </p>
                <GlassButton
                  variant="primary"
                  onClick={onOpen}
                  fullWidth
                  className="mt-3 !bg-gradient-to-r !from-emerald-600 !to-teal-700 !shadow-emerald-600/20"
                >
                  相談を始める
                </GlassButton>
              </motion.div>
            )}

            {(consultState === "open" || consultState === "sending") && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-3"
              >
                <textarea
                  value={consultQuestion}
                  onChange={(e) => onQuestionChange(e.target.value)}
                  placeholder="例: 最近返信が遅くなってきたんですが、どう判断すればいいですか？"
                  rows={3}
                  className="w-full rounded-xl border border-emerald-200/50 bg-white/70 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                />
                <GlassButton
                  variant="primary"
                  onClick={onSubmit}
                  disabled={!consultQuestion.trim() || consultState === "sending"}
                  fullWidth
                  className="!bg-gradient-to-r !from-emerald-600 !to-teal-700 !shadow-emerald-600/20"
                >
                  {consultState === "sending" ? "分析中..." : "カウンセラーに送る"}
                </GlassButton>
              </motion.div>
            )}

            {consultState === "replied" && consultReply && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-3"
              >
                {/* 質問 */}
                <div className="rounded-lg bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
                  Q: {consultQuestion}
                </div>
                {/* Counselorの返答 */}
                <div
                  className="rounded-xl px-4 py-3.5"
                  style={{
                    background: "linear-gradient(135deg, rgba(236,253,245,0.9), rgba(204,251,241,0.6))",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg, #059669, #0d9488)",
                      }}
                    >
                      <span className="text-white text-xs font-bold">C</span>
                    </div>
                    <span className="text-xs font-medium text-emerald-700">
                      Counselorの見立て
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {consultReply}
                  </p>
                </div>
                <button
                  onClick={onRestart}
                  className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  さらに相談する
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ── 自己発見フィードバック ──

interface SelfDiscoverySectionProps {
  feedbacks: SelfDiscoveryFeedbackEntry[];
}

function SelfDiscoverySection({ feedbacks }: SelfDiscoverySectionProps) {
  const latest = feedbacks[0];
  if (!latest?.questions || latest.questions.length === 0) return null;

  const dateLabel = new Date(latest.createdAt).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <FadeInView direction="up" delay={0.2}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(236,253,245,0.55) 100%)",
          border: "1px solid rgba(16,185,129,0.15)",
        }}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-sm">🔍</span>
              <span className="text-sm font-semibold text-slate-700">
                振り返りの問い
              </span>
            </div>
            <span className="text-xs text-slate-400">{dateLabel}</span>
          </div>

          {latest.counselorNote && (
            <p className="text-xs text-emerald-800 leading-relaxed italic">
              {latest.counselorNote}
            </p>
          )}

          <div className="space-y-2">
            {latest.questions.map((q, i) => (
              <div
                key={i}
                className="rounded-lg px-3 py-2.5"
                style={{
                  background: "rgba(236,253,245,0.6)",
                  border: "1px solid rgba(16,185,129,0.1)",
                }}
              >
                <p className="text-sm text-slate-700 leading-relaxed">
                  {q.question}
                </p>
                <span className="text-[10px] text-emerald-500 mt-1 inline-block">
                  {q.category === "body_sensation" && "身体感覚"}
                  {q.category === "emotion_awareness" && "感情の気づき"}
                  {q.category === "pattern_reflection" && "パターンの振り返り"}
                  {q.category === "gap_detection" && "ズレへの気づき"}
                </span>
              </div>
            ))}
          </div>

          {latest.gapDetection?.hasGap && latest.gapDetection.gapQuestion && (
            <div
              className="rounded-lg px-3 py-2.5"
              style={{
                background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.15)",
              }}
            >
              <p className="text-xs text-amber-700 mb-1 font-medium">
                行動との違い
              </p>
              <p className="text-xs text-slate-600 leading-relaxed mb-1">
                {latest.gapDetection.gapDescription}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                {latest.gapDetection.gapQuestion}
              </p>
            </div>
          )}
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ── 累積パターン分析 ──

interface CumulativePatternSectionProps {
  insight: GrowthInsight;
}

function CumulativePatternSection({ insight }: CumulativePatternSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayPatterns = isExpanded
    ? insight.patterns
    : insight.patterns.slice(0, 3);

  return (
    <FadeInView direction="up" delay={0.25}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(236,253,245,0.5) 100%)",
          border: "1px solid rgba(16,185,129,0.15)",
        }}
      >
        <div className="p-5 space-y-4">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-sm">📊</span>
              <span className="text-sm font-semibold text-slate-700">
                あなたの傾向分析
              </span>
            </div>
            <GlassBadge
              variant={insight.growthScore >= 60 ? "success" : "default"}
              size="sm"
            >
              成長スコア {insight.growthScore}
            </GlassBadge>
          </div>

          {/* パターン一覧 */}
          <div className="space-y-2">
            {displayPatterns.map((pattern, i) => (
              <PatternCard key={i} pattern={pattern} />
            ))}
          </div>

          {insight.patterns.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              {isExpanded
                ? "折りたたむ"
                : `他 ${insight.patterns.length - 3} 件を表示`}
            </button>
          )}

          {/* 改善ポイント */}
          {insight.improvements.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                変化の記録
              </p>
              {insight.improvements.map((imp, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-2.5"
                  style={{
                    background: "rgba(16,185,129,0.06)",
                    border: "1px solid rgba(16,185,129,0.12)",
                  }}
                >
                  <p className="text-xs font-medium text-emerald-700 mb-1">
                    {imp.area}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="line-through opacity-60">{imp.before}</span>
                    <span className="text-emerald-500">→</span>
                    <span className="text-emerald-700 font-medium">
                      {imp.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 次のアドバイス */}
          {insight.nextAdvice && (
            <div
              className="rounded-lg px-4 py-3"
              style={{
                background: "rgba(5,150,105,0.05)",
                border: "1px solid rgba(5,150,105,0.1)",
              }}
            >
              <p className="text-xs font-medium text-emerald-700 mb-1">
                Counselorの助言
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {insight.nextAdvice}
              </p>
            </div>
          )}

          {/* 統計 */}
          <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
            <span>接続 {insight.totalConnections}件</span>
            <span>切断 {insight.totalDisconnects}件</span>
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

function PatternCard({ pattern }: { pattern: GrowthPattern }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
      style={{
        background: pattern.improving
          ? "rgba(16,185,129,0.06)"
          : "rgba(0,0,0,0.02)",
        border: pattern.improving
          ? "1px solid rgba(16,185,129,0.15)"
          : "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-700 truncate">
            {pattern.name}
          </p>
          {pattern.improving && (
            <GlassBadge variant="success" size="sm">
              改善中
            </GlassBadge>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">
          {pattern.description}
        </p>
      </div>
      <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">
        {pattern.frequency}回
      </span>
    </div>
  );
}

// ── Exchange更新 ──

interface ExchangeSectionProps {
  exchanges: ExchangeRecord[];
  unacknowledgedCount: number;
  onAcknowledge: (exchangeId: string) => void;
}

function ExchangeSection({
  exchanges,
  unacknowledgedCount,
  onAcknowledge,
}: ExchangeSectionProps) {
  // 未確認を先に、確認済みを後に並べる
  const sortedExchanges = [...exchanges].sort((a, b) =>
    a.acknowledged === b.acknowledged ? 0 : a.acknowledged ? 1 : -1,
  );
  const hasExchanges = sortedExchanges.length > 0;

  return (
    <FadeInView direction="up" delay={0.4}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background: hasExchanges
            ? "rgba(255,255,255,0.7)"
            : "rgba(255,255,255,0.5)",
          border: unacknowledgedCount > 0
            ? "1px solid rgba(16,185,129,0.3)"
            : "1px dashed rgba(16,185,129,0.2)",
        }}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-teal-500 text-sm">⇄</span>
              <span className="text-sm font-medium text-slate-600">
                Exchange更新通知
              </span>
            </div>
            {unacknowledgedCount > 0 && (
              <GlassBadge variant="info" size="sm">
                {unacknowledgedCount}件 未確認
              </GlassBadge>
            )}
          </div>

          {!hasExchanges ? (
            <p className="text-xs text-slate-400">
              まだ相互フィードバックはありません。接続が深まると、お互いの Counselor が観測結果を交換します。
            </p>
          ) : (
            <div className="space-y-2">
              {sortedExchanges.slice(0, 5).map((ex) => (
                <ExchangeCard
                  key={ex.id}
                  exchange={ex}
                  onAcknowledge={onAcknowledge}
                />
              ))}
            </div>
          )}
        </div>
      </GlassCard>
    </FadeInView>
  );
}

function ExchangeCard({
  exchange,
  onAcknowledge,
}: {
  exchange: ExchangeRecord;
  onAcknowledge: (id: string) => void;
}) {
  const temp = exchange.payload.temperatureScore;
  const tempLabel =
    temp >= 8 ? "とても温かい" :
    temp >= 6 ? "温かい" :
    temp >= 4 ? "穏やか" :
    temp >= 2 ? "控えめ" : "冷却中";

  const tempColor =
    temp >= 6 ? "text-emerald-600" :
    temp >= 4 ? "text-teal-600" : "text-slate-500";

  const dateLabel = new Date(exchange.createdAt).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: exchange.acknowledged
          ? "rgba(0,0,0,0.02)"
          : "rgba(16,185,129,0.06)",
        border: exchange.acknowledged
          ? "1px solid rgba(0,0,0,0.06)"
          : "1px solid rgba(16,185,129,0.15)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${tempColor}`}>
              {tempLabel}
            </span>
            <span className="text-xs text-slate-400">
              温度感 {temp}/10
            </span>
            <span className="text-xs text-slate-300">{dateLabel}</span>
          </div>

          {exchange.payload.topicCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {exchange.payload.topicCategories.slice(0, 3).map((topic, i) => (
                <span
                  key={i}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {exchange.payload.hasAnxietySignal && (
            <p className="text-xs text-amber-600">
              ⚠ 懸念シグナルあり
            </p>
          )}

          {exchange.payload.nextRecommendedAction && (
            <p className="text-xs text-slate-500">
              推奨: {exchange.payload.nextRecommendedAction}
            </p>
          )}
        </div>

        {!exchange.acknowledged && (
          <button
            onClick={() => onAcknowledge(exchange.id)}
            className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex-shrink-0 px-2 py-1.5 rounded-md hover:bg-emerald-50 active:bg-emerald-100"
          >
            確認
          </button>
        )}
      </div>
    </div>
  );
}

// ── Honest Exit Rate ──

interface HonestExitRateSectionProps {
  metrics: {
    ratePercent: number;
    totalDisconnects: number;
    honestExits: number;
  };
}

function HonestExitRateSection({ metrics }: HonestExitRateSectionProps) {
  return (
    <FadeInView direction="up" delay={0.4}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(236,253,245,0.6) 100%)",
          border: "1px solid rgba(16,185,129,0.10)",
        }}
      >
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 14 }}>🛡️</span>
            <h3
              className="text-sm font-bold"
              style={{ color: "#059669" }}
            >
              Honest Exit Rate
            </h3>
          </div>

          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "rgba(30,30,60,0.5)" }}
          >
            Counselorの事前判断に基づく健全な撤退の割合。
            成婚バイアスのない、あなたの利益を最優先にした指標です。
          </p>

          <div className="flex items-end gap-1 mb-2">
            <span
              className="text-3xl font-extrabold"
              style={{ color: "#059669" }}
            >
              {metrics.ratePercent}
            </span>
            <span
              className="text-sm font-bold pb-1"
              style={{ color: "#059669" }}
            >
              %
            </span>
          </div>

          {/* プログレスバー */}
          <div
            className="w-full h-1.5 rounded-full mb-2"
            style={{ background: "rgba(16,185,129,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, metrics.ratePercent)}%`,
                background: "linear-gradient(90deg, #059669, #0d9488)",
              }}
            />
          </div>

          <p
            className="text-xs"
            style={{ color: "rgba(30,30,60,0.35)" }}
          >
            直近90日: {metrics.honestExits}件の健全な撤退 / {metrics.totalDisconnects}件の切断
          </p>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ── Partnerアップグレードプロンプト ──

function UpgradePrompt() {
  const benefits = [
    "24時間365日の専属カウンセラー",
    "行動観測による客観的フィードバック",
    "撤退判断あり（成婚バイアスなし）",
  ];

  return (
    <FadeInView direction="up" delay={0.1}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          border: "1px solid rgba(212,165,116,0.2)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          borderRadius: 16,
        }}
      >
        {/* Top accent — gold shimmer */}
        <div
          className="h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, #D4A574 30%, #C9A96E 50%, #D4A574 70%, transparent 100%)",
          }}
        />

        <div className="p-6 text-center space-y-5">
          {/* Icon — large with animated glow pulse */}
          <div className="flex justify-center pt-1">
            <motion.div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, #059669, #10B981)",
                boxShadow:
                  "0 0 24px rgba(16,185,129,0.3), 0 4px 12px rgba(0,0,0,0.2)",
              }}
              animate={{
                boxShadow: [
                  "0 0 24px rgba(16,185,129,0.3), 0 4px 12px rgba(0,0,0,0.2)",
                  "0 0 36px rgba(16,185,129,0.5), 0 4px 12px rgba(0,0,0,0.2)",
                  "0 0 24px rgba(16,185,129,0.3), 0 4px 12px rgba(0,0,0,0.2)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L14.09 8.26L20.18 8.63L15.54 12.74L16.81 19.02L12 15.77L7.19 19.02L8.46 12.74L3.82 8.63L9.91 8.26L12 2Z"
                  fill="white"
                  fillOpacity={0.9}
                />
              </svg>
            </motion.div>
          </div>

          {/* Title & description */}
          <div className="space-y-2">
            <h3
              className="text-lg font-bold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              専属Counselorを持つ
            </h3>
            <p
              className="text-sm leading-relaxed mx-auto max-w-[280px]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              あなただけの関係判断AIカウンセラーが伴走。
              結婚相談所では不可能な、構造的支援を。
            </p>
          </div>

          {/* Benefits list — gold checkmarks */}
          <div
            className="rounded-xl px-4 py-3.5 text-left space-y-2.5"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-2.5">
                <span
                  className="text-sm font-bold flex-shrink-0 mt-[1px]"
                  style={{ color: "#D4A574" }}
                >
                  &#10003;
                </span>
                <span
                  className="text-[13px] leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {benefit}
                </span>
              </div>
            ))}
          </div>

          {/* CTA button — warm gold */}
          <button
            className="w-full py-3.5 rounded-xl text-[15px] font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, #D4A574, #C9A96E)",
              color: "white",
              boxShadow:
                "0 4px 20px rgba(212,165,116,0.3), 0 2px 4px rgba(0,0,0,0.1)",
              border: "none",
              letterSpacing: "0.02em",
            }}
          >
            Partner プランを見る
          </button>
        </div>
      </GlassCard>
    </FadeInView>
  );
}
