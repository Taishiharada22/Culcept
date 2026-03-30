// Slide U2: MIRROR — 自己認識のズレ
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export interface MirrorSlideData {
  overallAccuracy: number; // 0-100
  totalPredictions: number;
  worstCategory: {
    name: string;
    accuracy: number;
  } | null;
}

interface Props {
  data: MirrorSlideData;
  onReady: () => void;
}

export default function MirrorSlide({ data, onReady }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-8"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        自己認識のズレ
      </motion.p>

      {/* Accuracy counter */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <CountUp target={Math.round(data.overallAccuracy)} />
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          自分の予測が当たった割合
        </p>
      </motion.div>

      {/* Worst category */}
      {data.worstCategory && (
        <motion.div
          className="px-4 py-3 rounded-xl mb-6"
          style={{ background: "rgba(255,255,255,0.04)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            最もズレが大きい領域
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: "rgba(255,255,255,0.8)" }}>
            {data.worstCategory.name}（{Math.round(data.worstCategory.accuracy)}%）
          </p>
        </motion.div>
      )}

      <motion.p
        className="text-sm leading-relaxed max-w-[260px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.4 }}
        onAnimationComplete={onReady}
      >
        ここが自分で思っているのと違う部分です
      </motion.p>
    </div>
  );
}

// ── Count-up animation ──

function CountUp({ target }: { target: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = target / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      if (step >= steps) {
        setValue(target);
        clearInterval(timer);
      } else {
        setValue(Math.round(increment * step));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [target]);

  return (
    <span className="text-4xl font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
      {value}%
    </span>
  );
}
