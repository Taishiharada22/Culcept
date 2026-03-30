// app/(immersive)/stargazer/_components/story/StoryProgress.tsx
// 上部セグメントプログレスバー
"use client";

import { motion } from "framer-motion";

interface StoryProgressProps {
  total: number;
  current: number; // 0-indexed
}

export default function StoryProgress({ total, current }: StoryProgressProps) {
  return (
    <div className="flex gap-1 px-4 pt-3 pb-2" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          {i <= current && (
            <motion.div
              className="h-full rounded-full"
              style={{
                background: i < current
                  ? "rgba(255,255,255,0.7)"
                  : "rgba(255,255,255,0.9)",
              }}
              initial={i === current ? { width: "0%" } : false}
              animate={{ width: "100%" }}
              transition={
                i === current
                  ? { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
                  : { duration: 0 }
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
