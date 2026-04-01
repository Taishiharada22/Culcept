"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { markOnboarded } from "@/lib/origin/v7/onboarding";

type WelcomePhase = "intro" | "map";
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

const MAP_CARDS: { key: TabKey; emoji: string; title: string; desc: string }[] = [
  {
    key: "todo",
    emoji: "✅",
    title: "今日やること",
    desc: "タスクを記録して完了するだけ。続けると曜日別パターンや集中しやすい時間帯が見えてきます。",
  },
  {
    key: "journal",
    emoji: "📝",
    title: "ジャーナル",
    desc: "その日の感情や出来事を一言でも。感情の波や気分の変動パターンをOriginが読み取ります。",
  },
  {
    key: "profile",
    emoji: "👤",
    title: "わたしの法則",
    desc: "蓄積されたデータから浮かび上がる、あなた自身の行動法則と傾向。使うほど精度が上がります。",
  },
];

export default function OriginWelcomeFlow({
  onComplete,
  onSkip,
  initialPhase = "intro",
}: Props) {
  const [phase, setPhase] = useState<WelcomePhase>(initialPhase);

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
        {/* ── Phase 1: 機能紹介 ── */}
        {phase === "intro" && (
          <motion.div
            key="intro"
            className="flex flex-col items-center justify-center gap-5 px-6"
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

            <div className="flex flex-col items-center gap-1">
              <motion.p
                className="text-center text-xl font-semibold tracking-wide"
                style={{ color: "#3a2a1a" }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.7 }}
              >
                毎日の記録が、
              </motion.p>
              <motion.p
                className="text-center text-xl font-semibold tracking-wide"
                style={{ color: "#3a2a1a" }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3, duration: 0.7 }}
              >
                あなたの取扱説明書になる。
              </motion.p>
            </div>

            <motion.p
              className="mt-1 max-w-xs text-center text-sm leading-relaxed text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.2, duration: 0.8 }}
            >
              タスク管理とジャーナルを日々使うだけで、
              <br />
              行動パターンや感情の法則が浮かび上がります。
            </motion.p>

            <motion.button
              className="mt-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.8, duration: 0.5 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setPhase("map")}
            >
              どんなことができる？
            </motion.button>

            <motion.button
              className="text-xs text-gray-400 underline decoration-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.2, duration: 0.5 }}
              onClick={handleSkip}
            >
              スキップして始める
            </motion.button>
          </motion.div>
        )}

        {/* ── Phase 2: 機能マップ ── */}
        {phase === "map" && (
          <motion.div
            key="map"
            className="flex flex-col items-center gap-5 px-4 py-8"
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
              <h2
                className="text-lg font-semibold"
                style={{ color: "#3a2a1a" }}
              >
                3つの機能で、自分を知る
              </h2>
              <p className="mt-1 text-center text-sm text-gray-500">
                気になるものをタップして始めましょう
              </p>
            </motion.div>

            <div className="grid w-full max-w-md grid-cols-1 gap-3">
              {MAP_CARDS.map((card, i) => (
                <motion.button
                  key={card.key}
                  className="flex items-start gap-3 rounded-2xl border border-amber-200/40 bg-white/60 p-4 text-left backdrop-blur-sm transition-colors hover:bg-amber-50/60"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleMapSelect(card.key)}
                >
                  <span className="mt-0.5 text-xl">{card.emoji}</span>
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "#3a2a1a" }}
                    >
                      {card.title}
                    </span>
                    <span className="text-xs leading-relaxed text-gray-500">
                      {card.desc}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>

            <motion.button
              className="mt-2 text-xs text-gray-400 underline decoration-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              onClick={handleSkip}
            >
              あとで見る
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
