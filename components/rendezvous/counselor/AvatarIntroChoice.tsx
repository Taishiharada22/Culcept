"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import CounselorMessage from "./CounselorMessage";
import type { AvatarIntroMode } from "@/lib/rendezvous/counselor/types";

interface AvatarIntroChoiceProps {
  candidateId: string;
  onChoose: (mode: AvatarIntroMode) => void;
}

const OPTIONS: {
  mode: AvatarIntroMode;
  title: string;
  subtitle: string;
  icon: string;
}[] = [
  {
    mode: "avatar",
    title: "私が挨拶する",
    subtitle: "分身があなたの代わりに自然な挨拶を送ります",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z",
  },
  {
    mode: "direct",
    title: "自分で話しかける",
    subtitle: "最初から自分のペースで会話を始められます",
    icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
  },
];

export default function AvatarIntroChoice({
  candidateId,
  onChoose,
}: AvatarIntroChoiceProps) {
  const [hoveredMode, setHoveredMode] = useState<AvatarIntroMode | null>(null);

  return (
    <div className="space-y-5">
      <CounselorMessage
        message="どうする？私が先に挨拶しておく？"
        delay={0}
      />

      <div className="grid gap-3 mt-2">
        {OPTIONS.map((opt, i) => (
          <FadeInView key={opt.mode} delay={0.3 + i * 0.15} direction="up">
            <GlassCard
              padding="none"
              hoverEffect={false}
              onClick={() => onChoose(opt.mode)}
              className="cursor-pointer group"
            >
              <motion.div
                className="flex items-start gap-4 p-5"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onHoverStart={() => setHoveredMode(opt.mode)}
                onHoverEnd={() => setHoveredMode(null)}
              >
                {/* アイコン */}
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-200 ${
                    hoveredMode === opt.mode
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d={opt.icon} />
                  </svg>
                </div>

                {/* テキスト */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors duration-200">
                    {opt.title}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                    {opt.subtitle}
                  </p>
                </div>

                {/* 矢印 */}
                <div className="flex-shrink-0 self-center text-slate-300 group-hover:text-indigo-400 transition-colors duration-200">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </motion.div>
            </GlassCard>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
