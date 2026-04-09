"use client";

import Link from "next/link";
import {
  GlassCard,
  GlassButton,
} from "@/components/ui/glassmorphism-design";

// ============================================================
// Phase Gate メッセージ
// Stargazer の Phase が不足している場合に表示する誘導UI
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

  return (
    <GlassCard
      padding="none"
      hoverEffect={false}
      className="overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(236,253,245,0.5) 100%)",
        border: "1px solid rgba(16,185,129,0.2)",
      }}
    >
      <div className="h-1 bg-gradient-to-r from-emerald-400/40 via-teal-400/30 to-emerald-400/40" />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #059669, #0d9488)",
              boxShadow: "0 2px 12px rgba(5,150,105,0.3)",
            }}
          >
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {featureName}を利用するには
            </h3>
            <p className="text-xs text-slate-500">
              Stargazer の深層観測を進めてください
            </p>
          </div>
        </div>

        <div
          className="rounded-xl px-4 py-3.5"
          style={{
            background: "linear-gradient(135deg, rgba(236,253,245,0.8), rgba(204,251,241,0.5))",
            border: "1px solid rgba(16,185,129,0.15)",
          }}
        >
          <p className="text-sm leading-relaxed text-emerald-900">
            あなたのことをもっと深く理解してから、
            関係の判断をお手伝いします。まずは Stargazer で自分自身を観測してください。
          </p>
        </div>

        {/* 進捗バー */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>観測進捗</span>
            <span>Phase {currentPhase} / {requiredPhase}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #059669, #0d9488)",
              }}
            />
          </div>
        </div>

        <Link href="/stargazer">
          <GlassButton
            variant="primary"
            fullWidth
            className="!bg-gradient-to-r !from-emerald-600 !to-teal-700 !shadow-emerald-600/20"
          >
            Stargazer で観測を続ける
          </GlassButton>
        </Link>
      </div>
    </GlassCard>
  );
}
