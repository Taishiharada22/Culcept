"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ORIGIN_MOTION } from "@/lib/origin/dailyOrbit/animations";

type Milestone = {
  day: number;
  label: string;
  reward: string;
  /** Originが返してくれる具体的な価値 */
  unlocks: string;
};

const MILESTONES: Milestone[] = [
  { day: 1, label: "開始", reward: "観測スタート", unlocks: "時間帯・最初のタスクからあなたの傾向を観測" },
  { day: 3, label: "3日目", reward: "最初の気づき", unlocks: "完了テクスチャから「達成の質」が見え始める" },
  { day: 7, label: "1週間", reward: "パターン発見", unlocks: "曜日別の完了率・感情の波が浮かび上がる" },
  { day: 14, label: "2週間", reward: "法則が生まれる", unlocks: "あなた専用の行動法則カードが生成される" },
  { day: 30, label: "1ヶ月", reward: "月の自画像", unlocks: "1ヶ月分の判断パターンから自画像を合成" },
];

type Props = {
  daysUsed: number;
};

export default function GrowthPath({ daysUsed }: Props) {
  // Show through day 30, but with different styles
  if (daysUsed > 30) return null;

  const nextMilestoneIdx = MILESTONES.findIndex((m) => m.day > daysUsed);
  const nextMilestone = nextMilestoneIdx >= 0 ? MILESTONES[nextMilestoneIdx] : null;
  const daysUntilNext = nextMilestone ? nextMilestone.day - daysUsed : 0;

  return (
    <motion.div
      {...ORIGIN_MOTION.cardEnter}
      className="mt-4 rounded-2xl bg-gradient-to-br from-white/40 to-amber-50/20 px-4 py-3"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">🌱 成長のみちすじ</p>
        {nextMilestone && daysUntilNext > 0 && (
          <p className="text-[10px] text-amber-500">
            あと{daysUntilNext}日 → {nextMilestone.reward}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="relative flex items-center justify-between">
        {/* Connection line */}
        <div className="absolute left-0 right-0 top-[9px] h-px bg-gray-200" />
        <div
          className="absolute left-0 top-[9px] h-px bg-amber-300 transition-all duration-500"
          style={{
            width: `${Math.min(100, Math.max(0, ((daysUsed - 1) / (MILESTONES[MILESTONES.length - 1].day - 1)) * 100))}%`,
          }}
        />

        {MILESTONES.map((ms) => {
          const reached = daysUsed >= ms.day;
          const isCurrent = reached && (nextMilestoneIdx === -1
            ? ms === MILESTONES[MILESTONES.length - 1]
            : MILESTONES[nextMilestoneIdx - 1] === ms);

          return (
            <div key={ms.day} className="relative z-10 flex flex-col items-center">
              {/* Dot */}
              <div
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[8px] ${
                  reached
                    ? "bg-amber-400 text-white shadow-sm"
                    : "bg-gray-100 text-gray-300"
                }`}
              >
                {reached ? "✓" : ms.day}
              </div>
              {/* Pulse on current */}
              {isCurrent && (
                <motion.div
                  animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute top-0 h-[18px] w-[18px] rounded-full bg-amber-300"
                />
              )}
              {/* Label */}
              <p className={`mt-1 text-[8px] ${reached ? "text-gray-600" : "text-gray-300"}`}>
                {ms.label}
              </p>
              {/* Reward preview (only for next milestone) */}
              {!reached && nextMilestoneIdx === MILESTONES.indexOf(ms) && (
                <p className="mt-0.5 text-[7px] text-amber-400">{ms.reward}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Value unlock preview — what Origin returns at the next milestone */}
      <AnimatePresence>
        {nextMilestone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 overflow-hidden rounded-xl bg-white/50 px-3 py-2"
          >
            <p className="text-[10px] leading-relaxed text-gray-500">
              <span className="font-medium text-amber-500">
                {nextMilestone.day}日目に解放 →
              </span>{" "}
              {nextMilestone.unlocks}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
