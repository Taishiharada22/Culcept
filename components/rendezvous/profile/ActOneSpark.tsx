"use client";

import { motion } from "framer-motion";
import { FadeInView } from "@/components/ui/glassmorphism-design";

type Props = {
  name: string;
  age?: number;
  area?: string;
  photoUrl?: string | null;
  corePhrase: string;
  resonanceLevel: number; // 0..3
};

export default function ActOneSpark({
  name,
  age,
  area,
  photoUrl,
  corePhrase,
  resonanceLevel,
}: Props) {
  return (
    <div className="px-5 pb-8">
      {/* Photo */}
      <FadeInView>
        <div
          className="relative w-full rounded-2xl overflow-hidden shadow-xl shadow-black/10"
          style={{ aspectRatio: "3/4" }}
        >
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-200 via-pink-100 to-amber-100 flex items-center justify-center">
              <span className="text-6xl">🌟</span>
            </div>
          )}

          {/* Gradient overlay at bottom for text */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      </FadeInView>

      {/* Core phrase */}
      <FadeInView delay={0.2}>
        <p className="mt-5 text-lg font-semibold leading-relaxed text-slate-700" style={{ color: "#6B5B4B" }}>
          {corePhrase}
        </p>
      </FadeInView>

      {/* Name, age, area */}
      <FadeInView delay={0.3}>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-base font-bold text-slate-900">{name}</span>
          {age && (
            <span className="text-sm text-slate-400">{age}</span>
          )}
          {area && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-sm text-slate-400">{area}</span>
            </>
          )}
        </div>
      </FadeInView>

      {/* Resonance indicator - 3 dots */}
      <FadeInView delay={0.4}>
        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              initial={{ scale: 0 }}
              animate={{
                scale: 1,
                backgroundColor:
                  i < resonanceLevel
                    ? "rgba(139,92,246,0.8)"
                    : "rgba(139,92,246,0.15)",
              }}
              transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
            />
          ))}
          <span className="ml-2 text-xs text-slate-400">
            {resonanceLevel === 3
              ? "強い共鳴"
              : resonanceLevel === 2
                ? "良い共鳴"
                : resonanceLevel === 1
                  ? "可能性あり"
                  : "未知数"}
          </span>
        </div>
      </FadeInView>
    </div>
  );
}
