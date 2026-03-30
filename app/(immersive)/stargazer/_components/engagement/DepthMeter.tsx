// DepthMeter.tsx
// 深度メーター — 進捗を「問数」ではなく「深さ」で表現
// 5段階の深度レイヤー: 表層 → 性格の輪郭 → 判断原理 → 深層パターン → 核心
"use client";

import { motion } from "framer-motion";

export type DepthLevel = 0 | 1 | 2 | 3 | 4;

const DEPTH_LAYERS: { level: DepthLevel; label: string; color: string }[] = [
  { level: 0, label: "表層", color: "rgba(140,150,180,0.4)" },
  { level: 1, label: "性格の輪郭", color: "rgba(140,130,90,0.5)" },
  { level: 2, label: "判断原理", color: "rgba(160,130,60,0.6)" },
  { level: 3, label: "深層パターン", color: "rgba(170,140,50,0.7)" },
  { level: 4, label: "核心", color: "rgba(190,160,40,0.85)" },
];

interface Props {
  /** 0-4 の深度レベル */
  currentDepth: DepthLevel;
  /** 現在のレイヤー内での進捗 (0-1) */
  layerProgress: number;
}

export default function DepthMeter({ currentDepth, layerProgress }: Props) {
  return (
    <div className="w-full max-w-sm mx-auto">
      {/* 深度ラベル */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-mono-sg text-[10px] tracking-[0.15em] uppercase"
          style={{ color: "rgba(120,125,140,0.4)" }}
        >
          観測深度
        </span>
        <motion.span
          key={currentDepth}
          className="font-display text-xs font-medium"
          style={{ color: DEPTH_LAYERS[currentDepth].color }}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {DEPTH_LAYERS[currentDepth].label}
        </motion.span>
      </div>

      {/* 深度バー — 5セグメント */}
      <div className="flex gap-1 h-1.5">
        {DEPTH_LAYERS.map((layer) => {
          const isCurrent = layer.level === currentDepth;
          const isCompleted = layer.level < currentDepth;
          const isFuture = layer.level > currentDepth;

          return (
            <div
              key={layer.level}
              className="flex-1 rounded-full overflow-hidden"
              style={{
                background: "rgba(140,150,180,0.08)",
              }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: layer.color }}
                animate={{
                  width: isCompleted
                    ? "100%"
                    : isCurrent
                      ? `${Math.max(5, layerProgress * 100)}%`
                      : "0%",
                }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 質問インデックスから深度レベルとレイヤー内進捗を計算 */
export function calculateDepth(
  questionIndex: number,
  totalQuestions: number
): { level: DepthLevel; layerProgress: number } {
  const ratio = questionIndex / Math.max(1, totalQuestions);
  // 5レイヤーに分割
  const layerSize = 1 / 5;
  const level = Math.min(4, Math.floor(ratio / layerSize)) as DepthLevel;
  const layerStart = level * layerSize;
  const layerProgress = Math.min(1, (ratio - layerStart) / layerSize);
  return { level, layerProgress };
}
