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
import { resolveType, type ResolvedResult, type QuestionAnswer } from "@/lib/stargazer/typeResolver";
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

  // QuestionFlow 途中再開用
  const [qfResumeAnswers, setQfResumeAnswers] = useState<QuestionAnswer[] | undefined>(undefined);
  const [qfResumeIndex, setQfResumeIndex] = useState<number | undefined>(undefined);
  const [qfResumeCfAnswers, setQfResumeCfAnswers] = useState<CfAnswer[] | undefined>(undefined);

  // 最終結果
  const [finalResult, setFinalResult] = useState<ResolvedResult | null>(null);
  const [allAnswers, setAllAnswers] = useState<QuestionAnswer[]>([]);
  const [cfAnswers, setCfAnswers] = useState<CfAnswer[]>([]);

  // 匿名ユーザー判定 + baseline後の18q状態復元
  const [isAnonymous, setIsAnonymous] = useState(true);
  // 18問途中再開用（未完了位置から再開）
  const [resumeAnswers, setResumeAnswers] = useState<OnboardingAnswer[] | undefined>(undefined);
  const [resumeIndex, setResumeIndex] = useState<number | undefined>(undefined);

  // localStorage 保存時の userId（クロスユーザー汚染防止）
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { supabaseBrowser } = await import("@/lib/supabase/client");
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        const anon = !user || user.is_anonymous === true;
        setIsAnonymous(anon);
        userIdRef.current = user?.id ?? null;

        // ━━ 復元ヘルパー: clusterResult + axisScores + answers から18問完了状態を復元 ━━
        const restoreOnboardingCompleted = (
          restored: {
            clusterResult: ClusterResult;
            axisScores: Partial<Record<TraitAxisKey, number>>;
            answers: OnboardingAnswer[];
          },
        ) => {
          setOnboardingAnswers(restored.answers);
          setClusterResult(restored.clusterResult);
          setOnboardingAxisScores(restored.axisScores);
          if (restored.axisScores) {
            beliefSetRef.current = updateFromMicroAxes(
              createEmptyBeliefSet(),
              restored.axisScores as Partial<Record<TraitAxisKey, number>>,
            );
          }
          // localStorage は削除しない — リフレッシュ時のフォールバック用に保持
        };

        // ━━ userId 照合付き localStorage 検証 ━━
        const currentUserId = user?.id ?? null;
        const isValidLsData = (parsed: { userId?: string; savedAt: number }) => {
          // 48時間チェック
          if (Date.now() - parsed.savedAt > 48 * 60 * 60 * 1000) return false;
          if (parsed.userId && currentUserId && parsed.userId !== currentUserId) return false;
          // 旧形式（userId なし）は後方互換としてそのまま有効扱い（自動書き換えはしない）
          return true;
        };

        // ━━ QuestionFlow 進捗復元ヘルパー ━━
        const tryRestoreQuestionflow = (): boolean => {
          try {
            const lsRaw = localStorage.getItem("sg_questionflow_progress_v1");
            if (lsRaw) {
              const parsed = JSON.parse(lsRaw) as {
                answers: QuestionAnswer[];
                nextIndex: number;
                savedAt: number;
                userId?: string;
                cfAnswers?: CfAnswer[];
              };
              if (parsed.answers?.length > 0 && isValidLsData(parsed)) {
                setQfResumeAnswers(parsed.answers);
                setQfResumeIndex(parsed.nextIndex);
                if (parsed.cfAnswers && parsed.cfAnswers.length > 0) {
                  setQfResumeCfAnswers(parsed.cfAnswers);
                }
                return true;
              }
            }
          } catch { /* noop */ }
          return false;
        };

        // ━━ 優先0: 全フロー完了済み（結果表示フェーズ）の復元 ━━
        // サーバーまたは localStorage に完了状態がある場合、結果表示フェーズに直接遷移
        const tryRestoreCompleted = (): boolean => {
          try {
            const lsRaw = localStorage.getItem("sg_orchestrator_completed_v1");
            if (lsRaw) {
              const parsed = JSON.parse(lsRaw) as {
                finalResult: ResolvedResult;
                stargazerAnswers: QuestionAnswer[];
                allAnswers: QuestionAnswer[];
                cfAnswers: CfAnswer[];
                savedAt: number;
                userId?: string;
              };
              if (parsed.finalResult && isValidLsData(parsed)) {
                setFinalResult(parsed.finalResult);
                setStargazerAnswers(parsed.stargazerAnswers ?? []);
                setAllAnswers(parsed.allAnswers ?? []);
                setCfAnswers(parsed.cfAnswers ?? []);
                // 18問データも復元（ResultsSequence で microAxes として使う）
                try {
                  const ls18 = localStorage.getItem("sg_18q_intermediate_v1");
                  if (ls18) {
                    const p18 = JSON.parse(ls18);
                    if (p18.clusterResult) {
                      restoreOnboardingCompleted(p18);
                    }
                  }
                } catch { /* noop */ }
                setPhase("detail_results");
                return true;
              }
            }
          } catch { /* noop */ }
          return false;
        };

        if (tryRestoreCompleted()) return;

        // ━━ 優先1: サーバー（DB）から進捗を復元 ━━
        const res = await fetch("/api/stargazer/onboarding-progress").catch(() => null);
        if (res?.ok) {
          const json = await res.json().catch(() => null);
          const progress = json?.progress as {
            answers: OnboardingAnswer[];
            nextIndex: number;
            savedAt: string;
            completed?: boolean;
            clusterResult?: ClusterResult;
            axisScores?: Partial<Record<TraitAxisKey, number>>;
          } | null;
          const qfProgress = json?.questionflowProgress as {
            answers: QuestionAnswer[];
            nextIndex: number;
            savedAt: string;
            completed?: boolean;
            cfAnswers?: CfAnswer[];
          } | null;

          // Case 0: QuestionFlow 完了済み（結果表示中にリフレッシュされた場合）
          // サーバーに completed=true があるが localStorage に結果がない場合
          // → QF回答を再取得して結果を再計算する
          if (qfProgress?.completed) {
            // QF に保存されていた回答から結果を再計算
            const savedQfAnswers = Array.isArray(qfProgress.answers) ? qfProgress.answers : [];
            if (savedQfAnswers.length > 0) {
              // 回答が残っている場合は結果を再計算
              const recomputedResult = resolveType(savedQfAnswers);
              // 18問データも復元
              if (progress?.completed && progress.clusterResult && progress.axisScores) {
                restoreOnboardingCompleted({
                  clusterResult: progress.clusterResult,
                  axisScores: progress.axisScores,
                  answers: progress.answers as OnboardingAnswer[],
                });
              } else {
                try {
                  const ls18 = localStorage.getItem("sg_18q_intermediate_v1");
                  if (ls18) {
                    const p18 = JSON.parse(ls18);
                    if (p18.clusterResult) restoreOnboardingCompleted(p18);
                  }
                } catch { /* noop */ }
              }
              // V5 onboarding回答をQA形式に変換して結合
              const v5AsQa: QuestionAnswer[] = (progress?.answers ?? []).map((a: OnboardingAnswer) => ({
                questionId: a.questionId,
                value: a.numericValue,
                responseTimeMs: a.responseTimeMs,
              }));
              setStargazerAnswers(savedQfAnswers);
              setAllAnswers([...v5AsQa, ...savedQfAnswers]);
              setFinalResult(recomputedResult);
              setPhase("detail_results");
              return;
            }
            // 回答がない場合（完了後に answers が空にされた）→ localStorage から復元を試みる
            // tryRestoreCompleted は既に試行済みなので、ここでは何もしない
          }

          // Case A: QuestionFlow 進捗あり（18問は完了済みの前提）
          if (qfProgress && Array.isArray(qfProgress.answers) && qfProgress.answers.length > 0 && !qfProgress.completed) {
            // 18問の状態も復元（サーバー or localStorage）
            if (progress?.completed && progress.clusterResult && progress.axisScores) {
              restoreOnboardingCompleted({
                clusterResult: progress.clusterResult,
                axisScores: progress.axisScores,
                answers: progress.answers as OnboardingAnswer[],
              });
            } else {
              // localStorage から18問データを復元
              try {
                const lsRaw = localStorage.getItem("sg_18q_intermediate_v1");
                if (lsRaw) {
                  const parsed = JSON.parse(lsRaw);
                  if (parsed.clusterResult) {
                    restoreOnboardingCompleted(parsed);
                  }
                }
              } catch { /* noop */ }
            }
            // QuestionFlow の進捗をセット（サーバー優先、localStorage上書き）
            setQfResumeAnswers(qfProgress.answers);
            setQfResumeIndex(qfProgress.nextIndex);
            if (qfProgress.cfAnswers && qfProgress.cfAnswers.length > 0) {
              setQfResumeCfAnswers(qfProgress.cfAnswers);
            }
            setPhase("stargazer");
            return;
          }

          if (progress && Array.isArray(progress.answers)) {
            const answeredCount = progress.answers.length;
            const totalQuestions = 18;

            if (answeredCount >= totalQuestions && progress.completed) {
              // Case B: 18問完了済み — QuestionFlow はまだ未開始
              if (progress.clusterResult && progress.axisScores) {
                restoreOnboardingCompleted({
                  clusterResult: progress.clusterResult,
                  axisScores: progress.axisScores,
                  answers: progress.answers as OnboardingAnswer[],
                });
                // QuestionFlow 進捗があれば stargazer、なければ intermediate（中間結果）
                const hasQfProgress = tryRestoreQuestionflow();
                setPhase(hasQfProgress ? "stargazer" : "intermediate");
                return;
              }
              // clusterResult がサーバーにない場合 → localStorage フォールバック（下で処理）
            } else if (answeredCount > 0 && answeredCount < totalQuestions) {
              // Case C: 18問途中 → 未完了位置から再開
              setResumeAnswers(progress.answers as OnboardingAnswer[]);
              setResumeIndex(progress.nextIndex);
              return;
            }
          }
        }

        // ━━ 優先2: localStorage フォールバック ━━
        // サーバーに進捗がない場合（ユーザーID変更後、サーバーエラー等）
        try {
          const lsRaw = localStorage.getItem("sg_18q_intermediate_v1");
          if (lsRaw) {
            const parsed = JSON.parse(lsRaw) as {
              clusterResult: ClusterResult;
              axisScores: Partial<Record<TraitAxisKey, number>>;
              answers: OnboardingAnswer[];
              savedAt: number;
              userId?: string;
            };
            if (parsed.clusterResult && isValidLsData(parsed)) {
              restoreOnboardingCompleted(parsed);
              const hasQfProgress = tryRestoreQuestionflow();
              setPhase(hasQfProgress ? "stargazer" : "intermediate");
              return;
            }
          }
        } catch { /* localStorage 使用不可環境 */ }

        // ━━ 優先3: QuestionFlow のみ localStorage にある場合 ━━
        // 18問データがどこにもないが QF 進捗だけ残っている場合 → QF から再開
        if (tryRestoreQuestionflow()) {
          setPhase("stargazer");
          return;
        }
      } catch {
        setIsAnonymous(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once — intentionally no deps

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

      // 18問完了時点で中間状態を常に保存（登録済みユーザーがページ離脱→再訪問した場合でも
      // QuestionFlowから再開できるように。認証状態に関わらず保存する）
      try {
        localStorage.setItem("sg_18q_intermediate_v1", JSON.stringify({
          clusterResult: cluster,
          axisScores,
          answers,
          savedAt: Date.now(),
          userId: userIdRef.current,
        }));
      } catch { /* QuotaExceeded 等は無視 */ }

      setPhase("intermediate");
    },
    [],
  );

  // ━━━ Phase 2: 中間結果 → Stargazer 64問開始 ━━━
  const handleStartStargazer = useCallback(() => {
    // サーバー側の18問進捗は削除しない — QF開始直後にリフレッシュしても
    // 18問完了状態を復元できるようにするため。QFの進捗保存時にサーバーは上書きされる。
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

      // 結果を localStorage に保存（リフレッシュ時の結果フェーズ復元用）
      try {
        localStorage.setItem("sg_orchestrator_completed_v1", JSON.stringify({
          finalResult: result,
          stargazerAnswers: sgAnswers,
          allAnswers: combined,
          cfAnswers: sgCfAnswers ?? [],
          savedAt: Date.now(),
          userId: userIdRef.current,
        }));
      } catch { /* QuotaExceeded 等は無視 */ }

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
      // 結果保存フラグをクリーンアップ（doSave が完了すれば不要）
      try {
        localStorage.removeItem("sg_orchestrator_completed_v1");
      } catch { /* noop */ }
      onComplete(finalResult, allAnswers, cfAnswers.length > 0 ? cfAnswers : undefined);
    }
  }, [finalResult, allAnswers, cfAnswers, onComplete]);

  const handleLogin = useCallback(() => {
    // 18問の中間結果をlocalStorageに保存（baseline完了後に /stargazer に戻ってきたとき再開するため）
    if (clusterResult) {
      try {
        localStorage.setItem("sg_18q_intermediate_v1", JSON.stringify({
          clusterResult,
          axisScores: onboardingAxisScores,
          answers: onboardingAnswers,
          savedAt: Date.now(),
          userId: userIdRef.current,
        }));
      } catch { /* QuotaExceeded 等は無視 */ }
    }
    window.location.href = "/login?next=/";
  }, [clusterResult, onboardingAxisScores, onboardingAnswers]);

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
            initialAnswers={resumeAnswers}
            initialIndex={resumeIndex}
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
            resumeFromIndex={qfResumeIndex}
            resumeAnswers={qfResumeAnswers}
            resumeCfAnswers={qfResumeCfAnswers}
            userId={userIdRef.current}
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
