"use client";

import { motion, AnimatePresence } from "framer-motion";
import type {
  StargazerQuestion,
  CoreObservationQuestion,
  ContradictionProbe,
  StarMap,
} from "@/types/stargazer";
import type { CoreObservationAnswer, EnhancedDailyAnswer } from "@/types/stargazer";
import ObservationCard from "../../_components/ObservationCard";
import EnhancedObservationCard from "../../_components/EnhancedObservationCard";
import CoreObservationFlow from "../../_components/CoreObservationFlow";
import ContradictionProbeCard from "../../_components/ContradictionProbeCard";
import StatusBar from "./StatusBar";
import ConsolePanel from "./ConsolePanel";

type ObservationPhase = "core" | "initial" | "daily" | "completed" | null;

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
  phaseBreakdown?: { initial: number; daily: number; core: number };
}

interface Props {
  observationPhase: ObservationPhase;
  currentQuestion: StargazerQuestion | CoreObservationQuestion | null;
  progress: { answered: number; total: number };
  currentQuestionIndex: number;
  isSubmitting: boolean;
  confidenceScore: number;
  observationStats: ObservationStats | null;
  contradictionProbe: ContradictionProbe | null;
  starMap: StarMap | null;
  contextFilter: string;
  onContextFilterChange: (ctx: string) => void;
  periodFilter: string;
  onPeriodFilterChange: (p: string) => void;
  onAnswer: (
    questionId: string,
    answer: "A" | "B",
    shownAt: string,
    answeredAt: string,
    responseTimeMs: number,
    confidenceSelfReport: number,
    skipped: boolean
  ) => void;
  onEnhancedDailyAnswer: (answer: EnhancedDailyAnswer) => void;
  onCoreAnswer: (answer: CoreObservationAnswer) => void;
  onContradictionProbeAnswer: (
    probeId: string,
    chipId: string,
    chipInsightType: string
  ) => void;
  onReload: () => void;
}

const PHASE_LABELS: Record<string, { label: string; sublabel: string; badge: string }> = {
  core: {
    label: "あなたの判断の輪郭を観測します",
    sublabel: "何を選ぶか、なぜ選ぶか、何を優先するか。直感で答えてください。",
    badge: "CORE OBSERVATION",
  },
  initial: {
    label: "あなたの深層を観測します",
    sublabel: "直感で答えてください。迷いや揺らぎまで、すべて観測します。",
    badge: "INITIAL OBSERVATION",
  },
  daily: {
    label: "今日の空模様を教えてください",
    sublabel: "今日のあなたの気分や状態を記録します。",
    badge: "日次観測",
  },
};

export default function ObserveView({
  observationPhase,
  currentQuestion,
  progress,
  currentQuestionIndex,
  isSubmitting,
  confidenceScore,
  observationStats,
  contradictionProbe,
  contextFilter,
  onContextFilterChange,
  periodFilter,
  onPeriodFilterChange,
  onAnswer,
  onEnhancedDailyAnswer,
  onCoreAnswer,
  onContradictionProbeAnswer,
  onReload,
}: Props) {
  const showQuestion = observationPhase !== "completed" && currentQuestion;
  const phaseInfo = PHASE_LABELS[observationPhase || ""] || PHASE_LABELS.initial;
  const resolution = Math.round((confidenceScore ?? 0) * 100);
  const totalAnswered = observationStats?.totalAnswered ?? progress.answered;

  return (
    <div className="space-y-8 max-w-[720px] mx-auto">
      {/* ステータスバー — 解像度リング */}
      <StatusBar
        resolution={resolution}
        answered={totalAnswered}
        total={progress.total}
        avgResponseTime={observationStats?.avgResponseTimeMs}
        hesitation={observationStats?.avgHesitation}
        completionRate={totalAnswered > 0 ? 98 : 0}
      />

      {/* 矛盾プローブ */}
      {contradictionProbe && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-instrument"
          style={{ border: "1px solid rgba(244,63,94,0.2)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            <span className="font-body text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
              Contradiction Probe
            </span>
          </div>
          <p className="font-body text-sm text-white/50 mb-4">
            あなたの中に揺らぎが観測されました
          </p>
          <ContradictionProbeCard
            probe={contradictionProbe}
            onAnswer={onContradictionProbeAnswer}
            isSubmitting={isSubmitting}
          />
        </motion.div>
      )}

      {/* 現在の質問カード — card-hero */}
      {showQuestion && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`q-${currentQuestionIndex}`}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
            className="card-hero"
          >
            {/* フェーズバッジ */}
            <div className="flex items-center gap-2 mb-8">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="font-body text-xs font-semibold tracking-[0.2em] text-amber-400/70 uppercase">
                {phaseInfo.badge}
              </span>
              {observationPhase === "core" && (
                <span className="ml-auto text-xs font-mono-sg text-white/30">CORE</span>
              )}
            </div>

            {/* 質問文 — カード幅いっぱい */}
            <h2 className="font-display text-2xl font-semibold text-white text-center mb-10">
              {"text" in currentQuestion
                ? (currentQuestion as StargazerQuestion | CoreObservationQuestion).text
                : phaseInfo.label}
            </h2>

            {/* 質問コンポーネント */}
            {observationPhase === "core" && currentQuestion ? (
              <CoreObservationFlow
                question={currentQuestion as CoreObservationQuestion}
                onComplete={onCoreAnswer}
                isSubmitting={isSubmitting}
              />
            ) : observationPhase === "daily" && currentQuestion ? (
              <EnhancedObservationCard
                question={currentQuestion as StargazerQuestion}
                onAnswer={onEnhancedDailyAnswer}
                isSubmitting={isSubmitting}
              />
            ) : currentQuestion ? (
              <ObservationCard
                question={currentQuestion as StargazerQuestion}
                onAnswer={onAnswer}
                isSubmitting={isSubmitting}
              />
            ) : null}

            {/* 進捗 */}
            {(observationPhase === "core" || observationPhase === "initial") && (
              <div className="mt-8 border-t border-white/[0.06] pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-body text-sm font-medium text-white/50">
                    観測進捗
                  </span>
                  <span className="font-mono-sg text-sm text-amber-300/70 font-semibold tabular-nums">
                    {progress.answered + currentQuestionIndex + 1}/{progress.total}
                  </span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300"
                    animate={{
                      width: `${((progress.answered + currentQuestionIndex) / Math.max(1, progress.total)) * 100}%`,
                    }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* 観測完了 */}
      {observationPhase === "completed" && !currentQuestion && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-hero text-center !py-12"
        >
          <div className="relative mb-6 inline-block">
            <span className="text-5xl">✅</span>
            <div className="absolute inset-[-20px] rounded-full bg-amber-400/5 blur-xl" />
          </div>
          <h3 className="font-display text-2xl font-semibold text-white/80 mb-2">
            今日の観測は完了しました
          </h3>
          <p className="font-body text-base text-white/40 max-w-sm mx-auto mb-6">
            結果タブであなたの分析結果を探索できます
          </p>
          <button
            onClick={onReload}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-xl font-body text-sm font-semibold text-amber-300 transition-all duration-200"
          >
            <span>🔭</span>
            <span>最新データを読み込む</span>
          </button>
        </motion.div>
      )}

      {/* 詳細コンソール（折りたたみ/デフォルト閉） */}
      <details className="group">
        <summary className="cursor-pointer font-body text-xs font-semibold text-white/30 hover:text-white/50 transition-colors flex items-center gap-2 py-2">
          <span className="group-open:rotate-90 transition-transform duration-200 text-white/20">▸</span>
          詳細コンソール
        </summary>
        <div className="mt-3">
          <ConsolePanel
            stats={observationStats}
            contextFilter={contextFilter}
            onContextFilterChange={onContextFilterChange}
            periodFilter={periodFilter}
            onPeriodFilterChange={onPeriodFilterChange}
          />
        </div>
      </details>
    </div>
  );
}
