"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import type { ResonanceResult } from "@/lib/rendezvous/instantResonance";

type Props = {
  result: ResonanceResult;
  onNext: () => void;
};

/** Axis value to personality trait badge */
function deriveTraits(
  discoveredAxes: ResonanceResult["discoveredAxes"],
): string[] {
  const traits: string[] = [];

  for (const axis of discoveredAxes) {
    switch (axis.axis) {
      case "emotional_openness":
        traits.push(axis.value >= 0.6 ? "共感力が高い" : "冷静な観察者");
        break;
      case "depth_speed":
        traits.push(axis.value >= 0.6 ? "深掘り好き" : "直感で動く");
        break;
      case "conversation_temperature":
        traits.push(axis.value >= 0.6 ? "熱い対話者" : "静かな傾聴者");
        break;
      case "social_energy":
        traits.push(axis.value >= 0.6 ? "社交的" : "内省的");
        break;
      case "initiative":
        traits.push(axis.value >= 0.6 ? "リーダー気質" : "サポーター気質");
        break;
      case "stimulation_need":
        traits.push(axis.value >= 0.6 ? "冒険心旺盛" : "安定志向");
        break;
      case "stability_need":
        traits.push(axis.value >= 0.6 ? "揺るがない芯" : "柔軟な適応力");
        break;
      case "conflict_directness":
        traits.push(axis.value >= 0.6 ? "本音で向き合う" : "調和を大切に");
        break;
      case "distance_need":
        traits.push(axis.value >= 0.6 ? "心地よい距離感" : "深い親密さ");
        break;
      case "structure_preference":
        traits.push(axis.value >= 0.6 ? "計画的" : "自由奔放");
        break;
    }
  }
  return traits.slice(0, 4);
}

export default function AvatarBirth({ result, onNext }: Props) {
  const [phase, setPhase] = useState<"particles" | "forming" | "revealed">("particles");
  const traits = deriveTraits(result.discoveredAxes);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("forming"), 1200);
    const t2 = setTimeout(() => setPhase("revealed"), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center min-h-[100dvh] px-5 pt-16 pb-8">
      {/* Particle / Avatar animation area */}
      <div className="relative w-48 h-48 mb-8 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === "particles" && (
            <motion.div
              key="particles"
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {Array.from({ length: 20 }).map((_, i) => {
                const angle = (i / 20) * Math.PI * 2;
                const radius = 60 + Math.random() * 30;
                return (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      left: "50%",
                      top: "50%",
                      background: `hsl(${260 + i * 5}, 70%, ${60 + i * 2}%)`,
                    }}
                    initial={{
                      x: Math.cos(angle) * radius,
                      y: Math.sin(angle) * radius,
                      opacity: 0,
                      scale: 0,
                    }}
                    animate={{
                      x: 0,
                      y: 0,
                      opacity: [0, 1, 1],
                      scale: [0, 1.5, 1],
                    }}
                    transition={{
                      duration: 1.2,
                      delay: i * 0.05,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}
            </motion.div>
          )}

          {phase === "forming" && (
            <motion.div
              key="forming"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0.8 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400 shadow-2xl shadow-purple-500/30"
              style={{ filter: "blur(2px)" }}
            />
          )}

          {phase === "revealed" && (
            <motion.div
              key="revealed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="relative"
            >
              {/* Glow ring */}
              <motion.div
                className="absolute -inset-4 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)",
                }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              {/* Avatar */}
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-violet-400 via-purple-500 to-pink-400 shadow-2xl shadow-purple-500/30 flex items-center justify-center">
                <span className="text-5xl">🌟</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Title */}
      <AnimatePresence>
        {phase === "revealed" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center w-full max-w-sm"
          >
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">
              あなたの分身が生まれました
            </h2>
            <p className="text-sm text-slate-500 mb-8">
              選択から見えてきたあなたの内面
            </p>

            {/* Discovered axes with bars */}
            <GlassCard className="mb-6" padding="md">
              <div className="space-y-4">
                {result.discoveredAxes.map((axis, i) => (
                  <motion.div
                    key={axis.axis}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.15 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-slate-700">
                        {axis.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {Math.round(axis.value * 100)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${axis.value * 100}%` }}
                        transition={{ delay: 0.4 + i * 0.15, duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>

            {/* Personality trait badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex flex-wrap items-center justify-center gap-2 mb-8"
            >
              {traits.map((trait, i) => (
                <motion.div
                  key={trait}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 + i * 0.1 }}
                >
                  <GlassBadge variant="gradient" size="md">
                    {trait}
                  </GlassBadge>
                </motion.div>
              ))}
            </motion.div>

            <GlassButton variant="primary" fullWidth onClick={onNext}>
              次へ
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
