// app/stargazer/_components/OnboardingOrchestrator.tsx
// V5 オ���ボーディングオーケストレーター
// OnboardingFlowV5 (18問) → IntermediateResults → QuestionFlow (53問+CF8〜10問+VC5問) → ResultsSequence → PostResultsStory → onComplete
// ユーザー体感総数: 約84〜86問
// InitialOnboardingFlow のドロップイン置き換え
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import OnboardingFlowV5, { type OnboardingAnswer } from "./OnboardingFlowV5";
import IntermediateResults from "./IntermediateResults";
import QuestionFlow from "./QuestionFlow";
import ResultsSequence from "./ResultsSequence";
import PostResultsStory from "./PostResultsStory";
import type { ClusterResult } from "@/lib/stargazer/behavioralPredictionEngine";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { ResolvedResult, QuestionAnswer } from "@/lib/stargazer/typeResolver";
import type { CfAnswer } from "@/lib/stargazer/cognitiveFitQuestions";
import {
  updateFromMicroAxes,
  createEmptyBeliefSet,
  type BeliefSet,
} from "@/lib/stargazer/bayesianAxisUpdater";
import { useStargazerSounds } from "@/hooks/useStargazerSounds";
import { useHaptics } from "@/hooks/useHaptics";
import { ensureAnonymousSession } from "@/lib/auth/anonymousAuth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrchestratorPhase =
  | "onboarding"         // V5: 18問 (Segment A+B)
  | "intermediate"       // 中間結果 (行動予測 + MBTI + ロックセクション)
  | "stargazer"          // Segment C: 53問+CF+VC (既存QuestionFlow)
  | "detail_results"     // 詳細結果表示 (ResultsSequence: 8カード Spotify Wrapped風)
  | "results";           // ストーリー + ログイン/保存CTA

interface Props {
  /** 全フロー完了時のコールバック (InitialOnboardingFlow互換) */
  onComplete: (result: ResolvedResult, allAnswers: QuestionAnswer[], cfAnswers?: CfAnswer[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingOrchestrator({ onComplete }: Props) {
  const [phase, setPhase] = useState<OrchestratorPhase>("onboarding");

  // V5 onboarding data
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswer[]>([]);
  const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);
  const [onboardingAxisScores, setOnboardingAxisScores] = useState<Partial<Record<TraitAxisKey, number>>>({});

  // Bayesian belief set — onboarding回答から初期化してStargazer回答で更新
  const beliefSetRef = useRef<BeliefSet>(createEmptyBeliefSet());

  // Stargazer 64問の回答（ResultsSequence用）
  const [stargazerAnswers, setStargazerAnswers] = useState<QuestionAnswer[]>([]);

  // 最終結果
  const [finalResult, setFinalResult] = useState<ResolvedResult | null>(null);
  const [allAnswers, setAllAnswers] = useState<QuestionAnswer[]>([]);
  const [cfAnswers, setCfAnswers] = useState<CfAnswer[]>([]);

  // 匿名ユーザー判定
  const [isAnonymous, setIsAnonymous] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const { supabaseBrowser } = await import("@/lib/supabase/client");
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        setIsAnonymous(!user || user.is_anonymous === true);
      } catch {
        setIsAnonymous(true);
      }
    })();
  }, []);

  // サウンド & 触覚フィードバック（ResultsSequence用）
  const { playStarBorn, playInsightReveal, playStreakMilestone } = useStargazerSounds();
  const haptics = useHaptics();

  // セッション確保（匿名ユーザー対応）
  const ensureSession = useCallback(async () => {
    try {
      await ensureAnonymousSession();
    } catch {
      // Silent fail — session creation is best-effort
    }
  }, []);

  // ━━━ Phase 1: V5 Onboarding 完了 ━━━
  const handleOnboardingComplete = useCallback(
    (
      answers: OnboardingAnswer[],
      cluster: ClusterResult,
      axisScores: Partial<Record<TraitAxisKey, number>>,
    ) => {
      setOnboardingAnswers(answers);
      setClusterResult(cluster);
      setOnboardingAxisScores(axisScores);

      // Bayesian信念をonboarding回答から初期化
      const microAxes: Record<string, number> = {};
      for (const ans of answers) {
        for (const [axis, val] of Object.entries(ans.axes)) {
          microAxes[axis] = (microAxes[axis] ?? 0) + val;
        }
      }
      // 平均化
      const counts: Record<string, number> = {};
      for (const ans of answers) {
        for (const axis of Object.keys(ans.axes)) {
          counts[axis] = (counts[axis] ?? 0) + 1;
        }
      }
      for (const axis of Object.keys(microAxes)) {
        microAxes[axis] /= counts[axis] ?? 1;
      }
      beliefSetRef.current = updateFromMicroAxes(
        beliefSetRef.current,
        microAxes as Partial<Record<TraitAxisKey, number>>,
      );

      setPhase("intermediate");
    },
    [],
  );

  // ━━━ Phase 2: 中間結果 → Stargazer 64問開始 ━━━
  const handleStartStargazer = useCallback(() => {
    setPhase("stargazer");
  }, []);

  // ━━━ Phase 3: Stargazer 64問完了 → 詳細結果表示 ━━━
  const handleStargazerComplete = useCallback(
    (result: ResolvedResult, sgAnswers: QuestionAnswer[], sgCfAnswers?: CfAnswer[]) => {
      // V5 onboarding回答をQuestionAnswer形式に変換して結合
      const v5AsQa: QuestionAnswer[] = onboardingAnswers.map((a) => ({
        questionId: a.questionId,
        value: a.numericValue,
        responseTimeMs: a.responseTimeMs,
      }));

      const combined = [...v5AsQa, ...sgAnswers];
      setStargazerAnswers(sgAnswers);
      setAllAnswers(combined);
      setCfAnswers(sgCfAnswers ?? []);
      setFinalResult(result);

      // 詳細結果表示（ResultsSequence）へ遷移
      setPhase("detail_results");
    },
    [onboardingAnswers],
  );

  // ━━━ Phase 3.5: 詳細結果表示完了 → ストーリーへ ━━━
  const handleDetailResultsDone = useCallback(() => {
    setPhase("results");
  }, []);

  // ━━━ Phase 4: ストーリー完了 → 保存 ━━━
  const handleSave = useCallback(() => {
    if (finalResult) {
      onComplete(finalResult, allAnswers, cfAnswers.length > 0 ? cfAnswers : undefined);
    }
  }, [finalResult, allAnswers, cfAnswers, onComplete]);

  const handleLogin = useCallback(() => {
    // ログインページへ遷移（結果はlocalStorageに保存済み）
    window.location.href = "/login?next=/stargazer";
  }, []);

  // ━━━ Render ━━━
  return (
    <AnimatePresence mode="wait">
      {phase === "onboarding" && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <OnboardingFlowV5
            onComplete={handleOnboardingComplete}
            ensureSession={ensureSession}
          />
        </motion.div>
      )}

      {phase === "intermediate" && clusterResult && (
        <motion.div
          key="intermediate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <IntermediateResults
            clusterResult={clusterResult}
            answers={onboardingAnswers}
            axisScores={onboardingAxisScores}
            onStartStargazer={handleStartStargazer}
            onStop={() => window.location.reload()}
            isAnonymous={isAnonymous}
            onLogin={handleLogin}
          />
        </motion.div>
      )}

      {phase === "stargazer" && (
        <motion.div
          key="stargazer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <QuestionFlow
            onComplete={handleStargazerComplete}
          />
        </motion.div>
      )}

      {phase === "detail_results" && finalResult && (
        <motion.div
          key="detail_results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ResultsSequence
            finalResult={finalResult}
            microAnswers={[]}
            coreAnswers={stargazerAnswers}
            rvAnswers={[]}
            microAxes={onboardingAxisScores}
            playStarBorn={playStarBorn}
            playInsightReveal={playInsightReveal}
            playStreakMilestone={playStreakMilestone}
            haptics={haptics}
            isAnonymous={isAnonymous}
            onLogin={handleLogin}
            onSave={handleDetailResultsDone}
          />
        </motion.div>
      )}

      {phase === "results" && (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PostResultsStory
            onSave={handleSave}
            isAnonymous={isAnonymous}
            onLogin={handleLogin}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
