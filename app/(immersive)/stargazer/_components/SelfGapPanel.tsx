"use client";

/**
 * SelfGapPanel
 * "今の自分" vs "負荷時の自分" のズレを可視化する
 * Stargazer DeepTab — 自己解読エンジン
 */

import { motion } from "framer-motion";
import type { SelfGapResult } from "@/lib/relational/types";

const FRAMING_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  protective: { label: "自己防衛", color: "rgba(99,102,241,0.85)", bg: "rgba(99,102,241,0.08)" },
  adaptive: { label: "適応", color: "rgba(234,179,8,0.85)", bg: "rgba(234,179,8,0.08)" },
  authentic: { label: "一貫", color: "rgba(16,185,129,0.85)", bg: "rgba(16,185,129,0.08)" },
};

function ScoreBar({
  score,
  color,
  label,
}: {
  score: number;
  color: string;
  label: string;
}) {
  const percent = ((score + 1) / 2) * 100;
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] w-10 text-right shrink-0"
        style={{ color: "rgba(72,78,100,0.75)" }}
      >
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full relative overflow-hidden" style={{ background: "rgba(160,170,200,0.10)" }}>
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, opacity: 0.65 }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        />
        {/* 中央マーカー */}
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: "50%", background: "rgba(160,170,200,0.18)" }}
        />
      </div>
      <span
        className="text-[11px] font-mono w-9 text-right shrink-0 tabular-nums"
        style={{ color }}
      >
        {score > 0 ? "+" : ""}{score.toFixed(1)}
      </span>
    </div>
  );
}

type Props = {
  selfGap: SelfGapResult;
};

export default function SelfGapPanel({ selfGap }: Props) {
  return (
    <motion.div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(160,170,200,0.10)",
        backdropFilter: "blur(16px)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-[3px] h-3 rounded-full"
          style={{ background: "rgba(139,92,246,0.6)" }}
        />
        <h4
          className="text-sm font-display font-bold"
          style={{ color: "rgba(24,30,50,0.92)" }}
        >
          ふだんの自分 と 追い詰められた自分
        </h4>
      </div>

      {/* Overall narrative */}
      <p
        className="text-sm leading-[1.8] mb-5"
        style={{ color: "rgba(56,62,84,0.85)" }}
      >
        {selfGap.overallNarrative}
      </p>

      {selfGap.items.length === 0 ? null : (
        <div className="space-y-3">
          {selfGap.items.map((item, i) => {
            const framingInfo =
              FRAMING_LABELS[item.framing] ?? FRAMING_LABELS.authentic;

            return (
              <motion.div
                key={item.axis}
                className="rounded-xl p-3.5"
                style={{
                  background: "rgba(255,255,255,0.5)",
                  border: "1px solid rgba(160,170,200,0.08)",
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.18 }}
              >
                {/* Axis label + framing badge */}
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "rgba(24,30,50,0.92)" }}
                  >
                    {item.axisLabel}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{
                      color: framingInfo.color,
                      background: framingInfo.bg,
                    }}
                  >
                    {framingInfo.label}
                  </span>
                </div>

                {/* Two score bars */}
                <div className="space-y-1.5 mb-3">
                  <ScoreBar score={item.normalScore} color="rgba(99,102,241,0.7)" label="ふだん" />
                  <ScoreBar score={item.stressedScore} color="rgba(234,179,8,0.7)" label="負荷時" />
                </div>

                {/* Interpretation */}
                <p
                  className="text-xs leading-[1.75]"
                  style={{ color: "rgba(58,64,86,0.8)" }}
                >
                  {item.interpretation}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
