// app/stargazer/_components/CoreWoundCard.tsx
// 深層タブ — あなたの根底にある痛み（Core Wound）
// デザイン: 3セクション構成（痛みの声 → 発動と防衛 → 癒えた姿）
"use client";

import { motion } from "framer-motion";
import { CORE_WOUND_MODELS, type CoreWoundModel } from "@/lib/stargazer/alter";

interface CoreWoundCardProps {
  archetypeCode: string;
}

export default function CoreWoundCard({ archetypeCode }: CoreWoundCardProps) {
  const model: CoreWoundModel | undefined = CORE_WOUND_MODELS[archetypeCode];

  if (!model) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(180,100,100,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-[10px] font-mono tracking-[0.2em] uppercase block mb-1"
                style={{ color: "rgba(160,90,90,0.6)" }}
              >
                Deep Layer
              </span>
              <h3
                className="font-display text-lg font-semibold"
                style={{ color: "rgba(30,20,20,0.94)" }}
              >
                心の奥にある痛み
              </h3>
            </div>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{
                background: "rgba(180,90,90,0.07)",
                color: "rgba(160,70,70,0.8)",
                border: "1px solid rgba(180,90,90,0.12)",
              }}
            >
              {model.woundShort}
            </span>
          </div>
        </div>

        {/* 痛みの声 — メインステートメント */}
        <div className="px-5 pb-4">
          <div
            className="rounded-xl px-4 py-4"
            style={{
              background: "rgba(180,90,90,0.04)",
              borderLeft: "3px solid rgba(180,90,90,0.25)",
            }}
          >
            <p
              className="leading-[1.9]"
              style={{
                color: "rgba(40,20,20,0.9)",
                fontSize: "1.05rem",
                fontFamily: "var(--font-display)",
              }}
            >
              {model.wound}
            </p>
          </div>
        </div>

        {/* 発動条件 + 防衛反応 — 2カラム */}
        <div className="px-5 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {/* 発動条件 */}
            <div
              className="rounded-xl px-3.5 py-3"
              style={{
                background: "rgba(180,90,90,0.03)",
                border: "1px solid rgba(180,90,90,0.08)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">⚡</span>
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{ color: "rgba(160,70,70,0.7)" }}
                >
                  いつ痛むか
                </span>
              </div>
              <p
                className="text-sm leading-[1.75]"
                style={{ color: "rgba(50,25,25,0.85)" }}
              >
                {model.trigger}
              </p>
            </div>

            {/* 防衛反応 */}
            <div
              className="rounded-xl px-3.5 py-3"
              style={{
                background: "rgba(90,80,160,0.03)",
                border: "1px solid rgba(90,80,160,0.08)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">🛡️</span>
                <span
                  className="text-[11px] font-semibold tracking-wide"
                  style={{ color: "rgba(80,70,150,0.7)" }}
                >
                  どう守るか
                </span>
              </div>
              <p
                className="text-sm leading-[1.75]"
                style={{ color: "rgba(35,30,65,0.85)" }}
              >
                {model.defense}
              </p>
            </div>
          </div>
        </div>

        {/* 癒えた姿 */}
        <div
          className="px-5 py-4"
          style={{
            background: "rgba(190,170,110,0.04)",
            borderTop: "1px solid rgba(190,170,110,0.10)",
          }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🌱</span>
            <span
              className="text-[11px] font-semibold tracking-wide"
              style={{ color: "rgba(130,110,50,0.7)" }}
            >
              癒えたとき、あなたは
            </span>
          </div>
          <p
            className="leading-[1.85]"
            style={{
              color: "rgba(50,40,10,0.88)",
              fontSize: "1.02rem",
              fontFamily: "var(--font-display)",
            }}
          >
            {model.healed}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
