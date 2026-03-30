"use client";

import { motion } from "framer-motion";
import { FadeInView } from "@/components/ui/glassmorphism-design";

interface CounselorMessageProps {
  message: string;
  typing?: boolean;
  delay?: number;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-indigo-400/70"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

export default function CounselorMessage({
  message,
  typing = false,
  delay = 0,
}: CounselorMessageProps) {
  return (
    <FadeInView delay={delay} direction="up">
      <div className="flex flex-col items-start max-w-[85%]">
        <span className="text-xs font-medium text-indigo-400/80 mb-1.5 ml-3">
          カウンセラー
        </span>
        <div className="relative rounded-2xl rounded-tl-md px-5 py-3.5 bg-white/60 backdrop-blur-xl border border-indigo-100/50 shadow-sm shadow-indigo-100/20">
          {/* 微かなグラデーションアクセント */}
          <div className="absolute inset-0 rounded-2xl rounded-tl-md bg-gradient-to-br from-indigo-50/40 via-transparent to-purple-50/30 pointer-events-none" />
          <div className="relative">
            {typing ? (
              <TypingDots />
            ) : (
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    </FadeInView>
  );
}
