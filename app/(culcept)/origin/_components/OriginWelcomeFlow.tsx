"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BreathingTransition from "@/app/stargazer/_components/BreathingTransition";
import { markOnboarded } from "@/lib/origin/v7/onboarding";

type WelcomePhase = "intro" | "breathing" | "first_memory" | "map";
type TabKey = "todo" | "journal" | "profile" | "memory" | "calendar" | "orbit";

interface Props {
  /** 初回メモリー探索開始 */
  onStartExploration: () => void;
  /** タブ遷移してオンボーディング完了 */
  onComplete: (tab: TabKey) => void;
  /** スキップ（既存ユーザーが再訪時など） */
  onSkip: () => void;
  /** 初期フェーズ（探索完了後にmapから再開する場合） */
  initialPhase?: WelcomePhase;
}

const INTRO_LINES = [
  "あなたの記憶を",
  "ここに刻みます。",
];

const MAP_CARDS: { key: TabKey; emoji: string; title: string; desc: string }[] = [
  {
    key: "todo",
    emoji: "✅",
    title: "今日やること",
    desc: "今日のタスクを整えて、1日を始める",
  },
  {
    key: "journal",
    emoji: "📝",
    title: "ジャーナル",
    desc: "今日の出来事と気持ちを言葉にして、1日を閉じる",
  },
  {
    key: "profile",
    emoji: "👤",
    title: "プロフィール",
    desc: "家族、仕事、価値観——あなたのプロフィールを育てる場所",
  },
];

export default function OriginWelcomeFlow({
  onStartExploration,
  onComplete,
  onSkip,
  initialPhase = "intro",
}: Props) {
  const [phase, setPhase] = useState<WelcomePhase>(initialPhase);

  const handleIntroComplete = useCallback(() => {
    setPhase("breathing");
  }, []);

  const handleBreathingComplete = useCallback(() => {
    setPhase("first_memory");
  }, []);

  const handleStartMemory = useCallback(() => {
    onStartExploration();
  }, [onStartExploration]);

  const handleMapSelect = useCallback(
    (tab: TabKey) => {
      markOnboarded();
      onComplete(tab);
    },
    [onComplete],
  );

  const handleSkip = useCallback(() => {
    markOnboarded();
    onSkip();
  }, [onSkip]);

  return (
    <div className="flex h-full items-center justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {/* ── Phase 1: シネマティックイントロ ── */}
        {phase === "intro" && (
          <motion.div
            key="intro"
            className="flex flex-col items-center justify-center gap-6 px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="relative h-16 w-16"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8, type: "spring", stiffness: 200 }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "rgba(190,170,110,0.4)",
                  filter: "blur(16px)",
                  animation: "sg-breathe 3s ease-in-out infinite",
                }}
              />
              <div
                className="absolute inset-2 rounded-full"
                style={{
                  background: "rgba(190,170,110,0.7)",
                  filter: "blur(4px)",
                  animation: "sg-breathe 3s ease-in-out infinite 0.3s",
                }}
              />
            </motion.div>

            <div className="flex flex-col items-center gap-2">
              {INTRO_LINES.map((line, i) => (
                <motion.p
                  key={i}
                  className="text-center text-xl font-semibold tracking-wide"
                  style={{ color: "#3a2a1a" }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + i * 0.5, duration: 0.7 }}
                >
                  {line}
                </motion.p>
              ))}
            </div>

            <motion.p
              className="mt-2 max-w-xs text-center text-sm leading-relaxed text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2, duration: 0.8 }}
            >
              Originは、あなたの記憶を掘り起こし
              <br />
              「自分がどう形作られたか」を発見する場所です。
            </motion.p>

            <motion.button
              className="mt-6 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.0, duration: 0.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleIntroComplete}
            >
              はじめる
            </motion.button>

            <motion.button
              className="text-xs text-gray-400 underline decoration-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.5, duration: 0.5 }}
              onClick={handleSkip}
            >
              スキップして自由に探索する
            </motion.button>
          </motion.div>
        )}

        {/* ── Phase 1.5: ブリージングトランジション ── */}
        {phase === "breathing" && (
          <motion.div
            key="breathing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <BreathingTransition
              durationMs={2800}
              accentColor="rgba(190,170,110,0.5)"
              onComplete={handleBreathingComplete}
              message="最初の記憶を、ひとつ選んでみましょう"
              lightMode
            />
          </motion.div>
        )}

        {/* ── Phase 2: 最初の記憶を作る ── */}
        {phase === "first_memory" && (
          <motion.div
            key="first_memory"
            className="flex flex-col items-center gap-6 px-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col items-center gap-3">
              <span className="text-3xl">🪨</span>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#3a2a1a" }}
              >
                最初の記憶を刻む
              </h2>
              <p className="max-w-sm text-center text-sm leading-relaxed text-gray-500">
                幼い頃、学生時代、社会に出てから——
                <br />
                どの時期でも構いません。
                <br />
                あなたの記憶をひとつ選んでください。
              </p>
            </div>

            <motion.button
              className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20"
              whileTap={{ scale: 0.97 }}
              onClick={handleStartMemory}
            >
              記憶探索を始める
            </motion.button>
          </motion.div>
        )}

        {/* ── Phase 3: Originの地図 ── */}
        {phase === "map" && (
          <motion.div
            key="map"
            className="flex flex-col items-center gap-6 px-4 py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <span className="text-2xl">✨</span>
              <h2
                className="text-lg font-semibold"
                style={{ color: "#3a2a1a" }}
              >
                最初の記憶が刻まれました
              </h2>
              <p className="mt-1 text-center text-sm text-gray-500">
                Originには、まだ多くの機能があります。
                <br />
                気になるものから始めてみましょう。
              </p>
            </motion.div>

            <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
              {MAP_CARDS.map((card, i) => (
                <motion.button
                  key={card.key}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-amber-200/40 bg-white/60 p-4 text-left backdrop-blur-sm transition-colors hover:bg-amber-50/60"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleMapSelect(card.key)}
                >
                  <span className="text-xl">{card.emoji}</span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "#3a2a1a" }}
                  >
                    {card.title}
                  </span>
                  <span className="text-xs leading-relaxed text-gray-500">
                    {card.desc}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
