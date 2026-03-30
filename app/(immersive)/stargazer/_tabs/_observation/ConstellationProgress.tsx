"use client";

// ConstellationProgress — 星座ドット型プログレス
// 従来の薄いプログレスバーを「星を繋ぐ」メタファーに置換
// 完了ドット → ゴールド点灯、現在 → 脈動、未来 → 薄い枠線

import { motion } from "framer-motion";

interface ConstellationProgressProps {
  current: number; // 0-based
  total: number;
  className?: string;
}

function isPeakPosition(idx: number, total: number): boolean {
  if (total <= 4) return false;
  const peakStart = Math.floor(total * 0.55);
  const peakEnd = Math.floor(total * 0.75);
  return idx >= peakStart && idx <= peakEnd;
}

export default function ConstellationProgress({
  current,
  total,
  className = "",
}: ConstellationProgressProps) {
  return (
    <div className={`flex items-center gap-0 px-2 ${className}`}>
      {Array.from({ length: total }, (_, i) => {
        const isFilled = i < current;
        const isActive = i === current;
        const isPeak = isPeakPosition(i, total);

        return (
          <div key={i} className="flex items-center" style={{ flex: i < total - 1 ? 1 : 0 }}>
            {/* Dot */}
            <motion.div
              className={[
                "sg-constellation-dot",
                isFilled ? (isPeak ? "peak-filled" : "filled") : "",
                isActive ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              initial={isFilled ? { scale: 0.5, opacity: 0 } : false}
              animate={isFilled ? { scale: 1, opacity: 1 } : undefined}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 300 }}
            />

            {/* Connecting line */}
            {i < total - 1 && (
              <div
                className={[
                  "sg-constellation-line",
                  isFilled ? "lit" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
