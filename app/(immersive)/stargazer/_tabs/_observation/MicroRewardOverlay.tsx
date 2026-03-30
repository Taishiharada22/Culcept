"use client";

// MicroRewardOverlay — 質問間のランダムなマイクロリワード
// Variable Ratio Reinforcement: スロットマシン原理で習慣形成
// 25% エコー（自己参照） / 25% インサイト断片 / 20% ミステリーティーズ / 20% 鮮明度カウンター / 10% 何もなし
// エコー = 「自分に関する情報は深く処理される」(Self-Reference Effect, Rogers+ 1977)

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

type RewardType = "echo" | "insight" | "mystery" | "clarity" | "none";

const MYSTERY_MESSAGES = [
  "...ここに矛盾の種がある",
  "...まだ見えていない自分がいる",
  "...この迷いの奥に、何かがある",
  "...核心に近づいている",
  "...表と裏が交差するところ",
];

const INSIGHT_TEMPLATES = [
  (ms: number) =>
    ms < 2000
      ? "この問いには迷わなかった"
      : ms > 6000
        ? "この問いで少し立ち止まった"
        : null,
  (_ms: number, position: number, total: number) =>
    position > total * 0.5 ? "後半に入って、答え方のリズムが変わり始めた" : null,
];

// ── 過去回答のlocalStorage読み取り ──
const ANSWER_HISTORY_KEY = "stargazer_answer_history_v1";

interface AnswerRecord {
  axisId: string;
  optionLabel: string;
  date: string;
}

function getRecentAnswerForAxis(axisId: string | undefined): AnswerRecord | null {
  if (!axisId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ANSWER_HISTORY_KEY);
    if (!raw) return null;
    const history: AnswerRecord[] = JSON.parse(raw);
    // 同じ軸の直近の回答を探す（新しい順にソート済みと想定）
    return history.find((r) => r.axisId === axisId) ?? null;
  } catch {
    return null;
  }
}

/** 回答を記録する（QuestionPhaseから呼ぶ） */
export function recordAnswerForEcho(axisId: string, optionLabel: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(ANSWER_HISTORY_KEY);
    const history: AnswerRecord[] = raw ? JSON.parse(raw) : [];
    // 先頭に追加（新しい順）
    history.unshift({
      axisId,
      optionLabel,
      date: new Date().toISOString().split("T")[0],
    });
    // 最大200件保持
    localStorage.setItem(
      ANSWER_HISTORY_KEY,
      JSON.stringify(history.slice(0, 200)),
    );
  } catch {
    // ignore
  }
}

interface MicroRewardOverlayProps {
  /** 表示するかどうか */
  show: boolean;
  /** 表示完了後のコールバック */
  onComplete: () => void;
  /** 現在の質問の回答時間(ms) */
  responseTimeMs: number;
  /** 現在の位置(1-based) */
  position: number;
  /** 総質問数 */
  total: number;
  /** 日付ベースのシード */
  seed?: number;
  /** 現在の質問の軸ID（エコー用） */
  currentAxisId?: string;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function pickRewardType(seed: number, hasEchoData: boolean): RewardType {
  const r = seededRandom(seed);
  if (r < 0.10) return "none";
  if (r < 0.30) return "clarity";
  if (r < 0.50) return "mystery";
  if (r < 0.75 && hasEchoData) return "echo";
  if (r < 0.75) return "insight"; // エコーデータなければinsightにfallback
  return "insight";
}

export default function MicroRewardOverlay({
  show,
  onComplete,
  responseTimeMs,
  position,
  total,
  seed,
  currentAxisId,
}: MicroRewardOverlayProps) {
  const rewardSeed = seed ?? Date.now() + position * 137;
  const pastAnswer = useMemo(() => getRecentAnswerForAxis(currentAxisId), [currentAxisId]);
  const hasEchoData = !!pastAnswer;
  const rewardType = useMemo(() => pickRewardType(rewardSeed, hasEchoData), [rewardSeed, hasEchoData]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }

    if (rewardType === "none") {
      const t = setTimeout(onComplete, 120);
      return () => clearTimeout(t);
    }

    setVisible(true);
    // エコーは少し長めに見せる（自己参照 → じっくり読ませる）
    // 40%高速化: echo 1800→1080, others 1000→600
    const displayMs = rewardType === "echo" ? 1080 : 600;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 120);
    }, displayMs);
    return () => clearTimeout(t);
  }, [show, rewardType, onComplete]);

  // Generate content
  const content = useMemo(() => {
    if (rewardType === "echo" && pastAnswer) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(pastAnswer.date).getTime()) / (24 * 60 * 60 * 1000),
      );
      const timeLabel = daysAgo === 0 ? "今日" : daysAgo === 1 ? "昨日" : `${daysAgo}日前`;
      return {
        text: `${timeLabel}、「${pastAnswer.optionLabel}」と答えた。今日は？`,
        style: "normal" as const,
        color: "rgba(201,169,110,0.75)",
      };
    }

    if (rewardType === "mystery") {
      const idx = Math.floor(seededRandom(rewardSeed + 7) * MYSTERY_MESSAGES.length);
      return {
        text: MYSTERY_MESSAGES[idx],
        style: "italic" as const,
        color: "rgba(139,92,246,0.65)",
      };
    }

    if (rewardType === "clarity") {
      const pct = (0.1 + seededRandom(rewardSeed + 3) * 0.5).toFixed(1);
      return {
        text: `輪郭が ${pct}% 鮮明になった`,
        style: "normal" as const,
        color: "rgba(170,150,90,0.7)",
      };
    }

    if (rewardType === "insight") {
      for (const template of INSIGHT_TEMPLATES) {
        const result = template(responseTimeMs, position, total);
        if (result)
          return {
            text: result,
            style: "normal" as const,
            color: "rgba(80,85,105,0.6)",
          };
      }
      return {
        text: `${position}問目を記録した`,
        style: "normal" as const,
        color: "rgba(80,85,105,0.5)",
      };
    }

    return null;
  }, [rewardType, rewardSeed, responseTimeMs, position, total, pastAnswer]);

  if (!content) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Subtle backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(250,251,254,0.4)" }}
          />

          {/* Reward content */}
          <motion.p
            className={`relative z-10 text-center px-8 text-sm leading-relaxed max-w-xs ${
              content.style === "italic" ? "italic" : ""
            }`}
            style={{ color: content.color }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {content.text}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
