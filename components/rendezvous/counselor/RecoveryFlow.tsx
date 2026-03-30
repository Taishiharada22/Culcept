"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CounselorMessage from "./CounselorMessage";
import TendencyInsightCard from "./TendencyInsightCard";
import NextSuggestionCard from "./NextSuggestionCard";
import AvatarIntroChoice from "./AvatarIntroChoice";
import PreBriefingCard from "./PreBriefingCard";
import type {
  RecoveryStep,
  TendencyInsight,
  NextSuggestion,
  PreConnectionBriefing,
  AvatarIntroMode,
} from "@/lib/rendezvous/counselor/types";

interface RecoveryFlowProps {
  analysisId: string;
  onComplete: () => void;
}

/** ステップ切り替えアニメーション */
const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

/** アバター送信中のパルスアニメーション */
function AvatarSendingAnimation() {
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      <div className="relative">
        {/* 外側のリング */}
        <motion.div
          className="w-20 h-20 rounded-full border-2 border-indigo-200/60"
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        {/* 内側のドット */}
        <motion.div
          className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500"
          animate={{ scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <p className="text-sm text-slate-500 animate-pulse">
        分身が挨拶を送っています...
      </p>
    </div>
  );
}

export default function RecoveryFlow({
  analysisId,
  onComplete,
}: RecoveryFlowProps) {
  const [step, setStep] = useState<RecoveryStep>("insight");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [insight, setInsight] = useState<TendencyInsight | null>(null);
  const [suggestion, setSuggestion] = useState<NextSuggestion | null>(null);
  const [briefing, setBriefing] = useState<PreConnectionBriefing | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ------- 初期データ取得 -------
  useEffect(() => {
    let cancelled = false;

    async function startRecovery() {
      try {
        const res = await fetch("/api/rendezvous/counselor/recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId }),
        });

        if (!res.ok) throw new Error("Recovery session could not be started");

        const data = await res.json();
        if (cancelled) return;

        setSessionId(data.sessionId);
        if (data.tendencyInsight) {
          setInsight(data.tendencyInsight);
        }
        if (data.candidateId) {
          setCandidateId(data.candidateId);
        }
      } catch (e) {
        if (!cancelled) setError("セッションの開始に失敗しました");
      }
    }

    startRecovery();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  // ------- 候補ポーリング -------
  const pollForSuggestion = useCallback(async () => {
    if (!sessionId) return;

    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(
          `/api/rendezvous/counselor/recovery?sessionId=${sessionId}`
        );
        if (!res.ok) throw new Error("Polling failed");

        const data = await res.json();

        if (data.suggestion) {
          setSuggestion(data.suggestion);
          if (data.suggestion.card?.candidateId) {
            setCandidateId(data.suggestion.card.candidateId);
          }
          setStep("suggestion");
          return;
        }
      } catch {
        // リトライ
      }

      // 2秒間隔でポーリング
      await new Promise((r) => setTimeout(r, 2000));
    }

    setError("候補の検索がタイムアウトしました");
  }, [sessionId]);

  // ------- ステップハンドラー -------
  const handleInsightContinue = useCallback(() => {
    setStep("waiting");
    pollForSuggestion();
  }, [pollForSuggestion]);

  const handleSuggestionAccept = useCallback(() => {
    setStep("intro_choice");
  }, []);

  const handleSuggestionSkip = useCallback(() => {
    // スキップ時は再検索
    setStep("waiting");
    setSuggestion(null);
    pollForSuggestion();
  }, [pollForSuggestion]);

  const handleIntroChoice = useCallback(
    async (mode: AvatarIntroMode) => {
      if (!candidateId) return;

      if (mode === "avatar") {
        setStep("avatar_sending");
      }

      try {
        const res = await fetch("/api/rendezvous/counselor/avatar-intro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId, mode, sessionId }),
        });

        if (!res.ok) throw new Error("Intro failed");

        const data = await res.json();

        if (data.briefing) {
          setBriefing(data.briefing);
        }

        // アバター送信中は少し待つ
        if (mode === "avatar") {
          await new Promise((r) => setTimeout(r, 2500));
        }

        setStep("briefing");
      } catch {
        setError("挨拶の送信に失敗しました");
      }
    },
    [candidateId, sessionId]
  );

  const handleBriefingReady = useCallback(() => {
    setStep("done");
    onComplete();
  }, [onComplete]);

  // ------- エラー表示 -------
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <p className="text-sm text-slate-500">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setStep("insight");
          }}
          className="text-sm text-indigo-500 hover:text-indigo-700 transition-colors"
        >
          もう一度試す
        </button>
      </div>
    );
  }

  // ------- ローディング（insight未取得） -------
  if (step === "insight" && !insight) {
    return (
      <CounselorMessage message="" typing delay={0} />
    );
  }

  return (
    <div className="relative">
      {/* 閉じるボタン（全ステップ共通） */}
      <button
        onClick={onComplete}
        aria-label="閉じる"
        className="absolute top-0 right-0 z-10 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-colors"
      >
        ✕
      </button>

      <AnimatePresence mode="wait">
        {/* Step 1: Insight */}
        {step === "insight" && insight && (
          <motion.div
            key="insight"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <TendencyInsightCard
              insight={insight}
              onContinue={handleInsightContinue}
            />
          </motion.div>
        )}

        {/* Step 2: Waiting */}
        {step === "waiting" && (
          <motion.div
            key="waiting"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            <CounselorMessage
              message="ちょっと待ってね...あなたに合いそうな方を探してみるね"
              delay={0}
            />
            <div className="flex justify-center py-6">
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-300"
                    animate={{
                      y: [0, -8, 0],
                      opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Suggestion */}
        {step === "suggestion" && suggestion && (
          <motion.div
            key="suggestion"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <NextSuggestionCard
              suggestion={suggestion}
              onAccept={handleSuggestionAccept}
              onSkip={handleSuggestionSkip}
            />
          </motion.div>
        )}

        {/* Step 4: Intro Choice */}
        {step === "intro_choice" && candidateId && (
          <motion.div
            key="intro_choice"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <AvatarIntroChoice
              candidateId={candidateId}
              onChoose={handleIntroChoice}
            />
          </motion.div>
        )}

        {/* Step 5: Avatar Sending */}
        {step === "avatar_sending" && (
          <motion.div
            key="avatar_sending"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <AvatarSendingAnimation />
          </motion.div>
        )}

        {/* Step 6: Briefing */}
        {step === "briefing" && briefing && (
          <motion.div
            key="briefing"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <PreBriefingCard briefing={briefing} onReady={handleBriefingReady} />
          </motion.div>
        )}

        {/* Step 7: Done */}
        {step === "done" && (
          <motion.div
            key="done"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <CounselorMessage
              message="準備完了！素敵な接続になりますように。"
              delay={0}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
