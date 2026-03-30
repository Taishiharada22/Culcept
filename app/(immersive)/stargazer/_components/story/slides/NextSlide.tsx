// Slide 5: NEXT — 次の一歩
"use client";

import { motion } from "framer-motion";
import type { NextSlideData } from "../storyDataBuilder";

interface Props {
  data: NextSlideData;
  onClose: () => void;
  onNavigateToObserve?: () => void;
}

export default function NextSlide({ data, onClose, onNavigateToObserve }: Props) {
  const actions = [
    {
      key: "observe",
      label: "もっと観測する",
      sublabel: `今日 ${data.todayCount} 問`,
      icon: "🔭",
      onClick: () => {
        onClose();
        onNavigateToObserve?.();
      },
    },
    {
      key: "detail",
      label: "詳細を見る",
      sublabel: "アーキタイプタブへ",
      icon: "◆",
      onClick: onClose,
    },
    ...(data.hasGenomeCard
      ? [
          {
            key: "genome",
            label: "Genome Cardを見る",
            sublabel: "あなたのカード",
            icon: "🧬",
            onClick: () => {
              window.location.href = "/genome-card";
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <motion.p
        className="text-xs tracking-widest uppercase mb-2"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        次の一歩
      </motion.p>

      <motion.p
        className="text-sm mb-10"
        style={{ color: "rgba(255,255,255,0.5)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        累計 {data.totalObservations} 問の観測
      </motion.p>

      <div className="space-y-3 w-full max-w-[280px]">
        {actions.map((action, i) => (
          <motion.button
            key={action.key}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left"
            style={{ background: "rgba(255,255,255,0.06)" }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.97 }}
            onClick={action.onClick}
          >
            <span className="text-lg" aria-hidden="true">{action.icon}</span>
            <div>
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.9)" }}>
                {action.label}
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {action.sublabel}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
