"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  GlassCard,
  GlassButton,
} from "@/components/ui/glassmorphism-design";

// ============================================================
// Phase Gate メッセージ
// Stargazer の Phase が不足している場合に表示する誘導UI
// Premium invitation スタイル — deep navy + emerald/gold accent
// ============================================================

interface PhaseGateMessageProps {
  currentPhase: number;
  requiredPhase: number;
  featureName: string;
}

export default function PhaseGateMessage({
  currentPhase,
  requiredPhase,
  featureName,
}: PhaseGateMessageProps) {
  const progress = Math.min(100, Math.round((currentPhase / requiredPhase) * 100));
  const steps = Array.from({ length: requiredPhase }, (_, i) => i + 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          border: "1px solid rgba(16,185,129,0.3)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          borderRadius: 16,
        }}
      >
        {/* Top accent line — emerald to gold */}
        <div
          className="h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, #10B981 0%, #D4A574 50%, #10B981 100%)",
          }}
        />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3.5">
            {/* Counselor icon — emerald glow with star */}
            <div className="relative flex-shrink-0">
              <motion.div
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, #059669, #10B981)",
                  boxShadow:
                    "0 0 20px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.2)",
                }}
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.2)",
                    "0 0 28px rgba(16,185,129,0.5), 0 2px 8px rgba(0,0,0,0.2)",
                    "0 0 20px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.2)",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2L14.09 8.26L20.18 8.63L15.54 12.74L16.81 19.02L12 15.77L7.19 19.02L8.46 12.74L3.82 8.63L9.91 8.26L12 2Z"
                    fill="white"
                    fillOpacity={0.9}
                  />
                </svg>
              </motion.div>
            </div>

            <div>
              <h3
                className="text-[15px] font-bold"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                {featureName}を利用するには
              </h3>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Stargazer の深層観測を進めてください
              </p>
            </div>
          </div>

          {/* Description card */}
          <div
            className="rounded-xl px-4 py-3.5"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              あなたのことをもっと深く理解してから、
              関係の判断をお手伝いします。まずは Stargazer で自分自身を観測してください。
            </p>
          </div>

          {/* Step progress bar */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                観測進捗
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: "#D4A574" }}
              >
                Phase {currentPhase} / {requiredPhase}
              </span>
            </div>

            {/* Horizontal step indicators */}
            <div className="flex items-center gap-1.5">
              {steps.map((step) => {
                const isComplete = step <= currentPhase;
                const isCurrent = step === currentPhase + 1;
                return (
                  <div
                    key={step}
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{
                      background: isComplete
                        ? "linear-gradient(90deg, #10B981, #059669)"
                        : isCurrent
                          ? "rgba(16,185,129,0.25)"
                          : "rgba(255,255,255,0.08)",
                      boxShadow: isComplete
                        ? "0 0 8px rgba(16,185,129,0.3)"
                        : isCurrent
                          ? "0 0 6px rgba(16,185,129,0.15)"
                          : "none",
                    }}
                  >
                    {isCurrent && (
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: "linear-gradient(90deg, #10B981, #059669)",
                          width: "40%",
                        }}
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTA button — gold/emerald gradient */}
          <Link href="/stargazer">
            <button
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              style={{
                background:
                  "linear-gradient(135deg, #10B981 0%, #059669 40%, #D4A574 100%)",
                color: "white",
                boxShadow:
                  "0 4px 16px rgba(16,185,129,0.25), 0 2px 4px rgba(0,0,0,0.1)",
                border: "none",
              }}
            >
              Stargazer で観測を続ける
            </button>
          </Link>
        </div>
      </GlassCard>
    </motion.div>
  );
}
