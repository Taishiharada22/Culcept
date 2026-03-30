// app/stargazer/_components/ChangeResistanceMap.tsx
// Layer 6: 変容の可能性 — 変化抵抗マップ（安定している軸の可視化）
"use client";

import { motion } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";

export interface ChangeResistanceMapProps {
  mostStable: Array<{
    axis: string;
    axisLabel: string;
    interpretation: string;
  }>;
}

export default function ChangeResistanceMap({
  mostStable,
}: ChangeResistanceMapProps) {
  if (mostStable.length === 0) {
    return null;
  }

  return (
    <FadeInView>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-mono tracking-[0.22em] uppercase text-amber-300/80">
              変化抵抗マップ
            </span>
            <span className="text-[10px] tracking-widest text-amber-400/40">
              Change Resistance Map
            </span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
        </div>

        {/* Anchor nodes */}
        <div className="space-y-3">
          {mostStable.map((item, i) => (
            <motion.div
              key={item.axis}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: 0.22,
                delay: i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <GlassCard className="p-4">
                <div
                  className="rounded-xl p-4"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(217,119,6,0.07) 0%, rgba(180,83,9,0.04) 100%)",
                    border: "1px solid rgba(217,119,6,0.18)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Anchor icon */}
                    <motion.span
                      className="text-xl leading-none mt-0.5 flex-shrink-0"
                      animate={{ rotate: [0, -3, 3, 0] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.8,
                      }}
                    >
                      ⚓
                    </motion.span>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-amber-300/90 mb-1.5 leading-tight">
                        {item.axisLabel}
                      </h3>
                      <p className="text-xs leading-relaxed text-white/72">
                        {item.interpretation}
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>

        {/* Footer message */}
        <motion.p
          className="text-xs text-center leading-relaxed"
          style={{ color: "rgba(217,119,6,0.65)" }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: mostStable.length * 0.1 + 0.2 }}
        >
          安定している軸は、あなたのアイデンティティの土台です。変えようとする必要はありません。
        </motion.p>
      </div>
    </FadeInView>
  );
}
