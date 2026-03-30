"use client";

// IntroPhase — 観測イントロ画面
// リピーター向け: 1カラム・3層構造（greeting → CTA → 実績ライン → 折りたたみ詳細）
// 初回向け: 従来の2カラム（ただしCTA位置を改善）
// 心理学: Von Restorff Effect（フォーカルポイント1つ）+ Progressive Disclosure

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyGreeting, DailyWhisper } from "@/lib/stargazer/dailyInsightEngine";
import type { TimeOfDay } from "@/lib/shared/timeOfDay";
import { getTimeOfDay } from "@/lib/shared/timeOfDay";
import StreakDisplay from "../../_components/StreakDisplay";
import type { PausedSession } from "@/lib/stargazer/sessionPause";

const TIME_GREETINGS: Record<TimeOfDay, { emoji: string; text: string }> = {
  morning: {
    emoji: "🌅",
    text: "朝はまだ輪郭が柔らかい。今の感覚に合った問いから始めます。",
  },
  afternoon: {
    emoji: "☀️",
    text: "日中の判断や揺れが残っている時間帯。今日の自分を拾っていきます。",
  },
  night: {
    emoji: "🌙",
    text: "一日の余韻がいちばん見える時間。今の自分に合う角度から覗いてみます。",
  },
};

interface IntroPhaseProps {
  greeting: DailyGreeting | null;
  whisper: DailyWhisper | null;
  totalObservations: number;
  observedAxisCount: number;
  formattedDate: string;
  onStart: () => void;
  onResume?: () => void;
  pausedSession?: PausedSession | null;
}

export default function IntroPhase({
  greeting,
  whisper,
  totalObservations,
  observedAxisCount,
  formattedDate,
  onStart,
  onResume,
  pausedSession,
}: IntroPhaseProps) {
  const [showDetails, setShowDetails] = useState(false);
  const timeOfDay = useMemo(() => getTimeOfDay(), []);
  const timeGreeting = TIME_GREETINGS[timeOfDay];
  const isReturning = totalObservations >= 3;

  // ── Paused Session ──
  if (pausedSession) {
    const answeredCount = pausedSession.answeredQuestionIds?.length ?? 0;
    return (
      <div className="space-y-5">
        <motion.div
          className="card-hero-star text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-4xl block mb-4">⏸️</span>
          <p className="sg-text-title">
            途中まで進んだ観測があります
          </p>
          <p className="mt-3 sg-text-body leading-8">
            {answeredCount}問まで記録済み。続きから再開できます。
          </p>

          <motion.button
            onClick={onResume}
            className="btn-primary-sg sg-cta-pulse w-full py-5 text-lg tracking-wide mt-6"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            続きから観測する
          </motion.button>

          <button
            onClick={onStart}
            className="mt-3 w-full py-2.5 rounded-xl text-sm transition-all"
            style={{
              background: "rgba(0,0,0,0.02)",
              border: "1px solid rgba(140,150,180,0.14)",
              color: "rgba(80,85,105,0.6)",
            }}
          >
            最初から始め直す
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Returning User: シンプル1カラム ──
  // 構成: CTA（最上部）→ 朝の一問 → greeting → 実績 → 折りたたみ詳細
  // 心理学: ファーストビューに行動導線＋日替わりフックを置く
  if (isReturning) {
    return (
      <div className="space-y-5">
        {/* Layer 1: 日付 + CTA — ファーストビューの主役 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {/* 日付とストリーク */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-mono-sg text-[0.72rem] tracking-[0.14em]"
              style={{ color: "rgba(120,105,68,0.55)" }}
            >
              {formattedDate}
            </span>
            <StreakDisplay compact />
          </div>

          {/* CTA — 最上部に配置、すぐ押せる */}
          <motion.button
            onClick={onStart}
            className="btn-primary-sg sg-cta-pulse w-full py-5 text-lg tracking-wide"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            今日の観測を始める
          </motion.button>

          {/* 実績ライン — CTAの直下にコンパクトに */}
          <p
            className="text-center mt-2.5 sg-text-caption"
            style={{ color: "rgba(120,105,68,0.35)" }}
          >
            {totalObservations}回目の観測
            {observedAxisCount > 0 && ` · ${observedAxisCount}/45軸`}
          </p>
        </motion.div>

        {/* Layer 2: 朝の一問 — 毎日違うフック（CTAのすぐ下） */}
        {whisper && (
          <motion.div
            className="card-narrative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <span className="sg-text-micro">今日の注目</span>
            <p className="mt-1.5 sg-text-body leading-7">
              {whisper.text}
            </p>
          </motion.div>
        )}

        {/* Layer 3: Greeting — 世界観の演出 */}
        <motion.div
          className="card-hero-star"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <div className="space-y-4">
            <p
              className="font-display text-[1.85rem] leading-[1.22]"
              style={{ color: "rgba(18,24,44,0.97)" }}
            >
              {greeting?.headline ??
                "今日の揺れ方から、今の自分に必要な問いを出します"}
            </p>

            {greeting?.subtext && (
              <p className="sg-text-narrative leading-8">
                {greeting.subtext}
              </p>
            )}
          </div>
        </motion.div>

        {/* Layer 4: 折りたたみ詳細 */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs transition-colors py-3 px-4"
            style={{ color: "rgba(120,125,140,0.45)", minHeight: "44px" }}
          >
            {showDetails ? "▴ 閉じる" : "▾ 詳しく見る"}
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-3">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="sg-stat-card">
                      <span className="sg-stat-label">累計観測数</span>
                      <span className="sg-stat-value">{totalObservations}</span>
                    </div>
                    <div className="sg-stat-card">
                      <span className="sg-stat-label">現在の輪郭</span>
                      <span className="sg-text-title mt-2 block">
                        {observedAxisCount > 0
                          ? `${observedAxisCount} / 45軸`
                          : "観測中"}
                      </span>
                    </div>
                  </div>

                  {/* Streak full */}
                  <div
                    className="rounded-xl p-3"
                    style={{
                      background: "rgba(255,255,255,0.45)",
                      border: "1px solid rgba(186,166,110,0.15)",
                    }}
                  >
                    <span className="sg-text-micro mb-2 block">
                      観測ストリーク
                    </span>
                    <StreakDisplay />
                  </div>

                  {/* Flow explanation */}
                  <div className="card-info">
                    <span className="sg-text-micro">観測の流れ</span>
                    <p className="mt-2 sg-text-body font-medium">
                      状態を記録する → 今日の問いに答える → 観測結果を確認する
                    </p>
                    <p className="mt-1 sg-text-caption leading-7">
                      迷い方や反応の速さも観測しています。翌日は履歴をもとに、別の角度から問いを届けます。
                    </p>
                    <p
                      className="mt-2 sg-text-caption leading-6 flex items-center gap-1.5"
                      style={{ color: "rgba(120,125,140,0.35)" }}
                    >
                      <span style={{ fontSize: "0.7rem" }}>🔒</span>
                      観測データはあなた専用です。あなた以外には公開されません。
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  // ── First-time User: 2カラム（CTAを外に出す） ──
  return (
    <div className="space-y-5">
      <motion.div
        className="card-section flex items-start gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(251,191,36,0.14))",
            border: "1px solid rgba(139,92,246,0.2)",
            boxShadow: "0 8px 24px rgba(90,80,180,0.08)",
          }}
        >
          <span className="text-2xl">{timeGreeting.emoji}</span>
        </div>
        <div className="min-w-0 space-y-2">
          <span className="sg-text-micro">日次観測</span>
          <p className="sg-text-subtitle">
            今の状態とこれまでの履歴から、あなた向けの問いを組み立てます
          </p>
          <p className="sg-text-body">{timeGreeting.text}</p>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
        {/* Hero card — メインの問いかけ */}
        <motion.div
          className="card-hero-star"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <span className="sg-text-micro">今日の窓</span>
              <p
                className="font-display text-[2.05rem] leading-[1.18]"
                style={{ color: "rgba(18,24,44,0.98)" }}
              >
                {greeting?.headline ??
                  "今日の揺れ方から、今の自分に必要な問いを出します"}
              </p>
            </div>
            <div
              className="rounded-2xl px-4 py-3 text-right"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(186,166,110,0.24)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78)",
              }}
            >
              <span
                className="font-mono-sg block text-[0.76rem]"
                style={{
                  letterSpacing: "0.14em",
                  color: "rgba(108,92,58,0.9)",
                }}
              >
                {formattedDate}
              </span>
              <span className="mt-1 block sg-text-caption">1日1回のみ</span>
            </div>
          </div>

          <p className="mt-4 sg-text-body leading-8">
            {greeting?.subtext ??
              "固定の質問ではなく、これまでの履歴と今の状態から、今日覗くべき角度を選びます。"}
          </p>

          {whisper && (
            <div
              className="mt-5 rounded-2xl p-4"
              style={{
                background: "rgba(255,255,255,0.58)",
                border: "1px solid rgba(139,92,246,0.14)",
              }}
            >
              <span className="sg-text-micro">注目</span>
              <p className="mt-2 sg-text-body leading-8">{whisper.text}</p>
            </div>
          )}
        </motion.div>

        {/* Status card — card-info (軽量化) */}
        <motion.div
          className="card-info flex flex-col gap-4"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.16 }}
        >
          <div className="space-y-2">
            <span className="sg-text-micro">観測ステータス</span>
            <p className="sg-text-body leading-8">
              初回でも気負わなくて大丈夫。今のあなたの答え方が、そのまま最初の観測データになります。
            </p>
          </div>

          <div className="card-info">
            <span className="sg-text-micro">観測の流れ</span>
            <p className="mt-2 sg-text-body font-medium">
              状態を記録する → 今日の問いに答える → 観測結果を確認する
            </p>
            <p className="mt-1 sg-text-caption leading-7">
              迷い方や反応の速さも観測しています。翌日は履歴をもとに、別の角度から問いを届けます。
            </p>
            <p
              className="mt-2 sg-text-caption leading-6 flex items-center gap-1.5"
              style={{ color: "rgba(120,125,140,0.35)" }}
            >
              <span style={{ fontSize: "0.7rem" }}>🔒</span>
              観測データはあなた専用です。あなた以外には公開されません。
            </p>
          </div>
        </motion.div>
      </div>

      {/* CTA — カラムの外に全幅配置 */}
      <motion.button
        onClick={onStart}
        className="btn-primary-sg sg-cta-pulse w-full py-5 text-lg tracking-wide"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
      >
        今日の観測を始める
      </motion.button>
    </div>
  );
}
