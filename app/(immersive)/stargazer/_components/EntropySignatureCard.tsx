// app/stargazer/_components/EntropySignatureCard.tsx
// エントロピー署名カード — 人格構造の一貫性パターンを表示
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EntropySignature } from "@/lib/stargazer/innovativeMechanisms";
import type { ResonancePrediction } from "@/lib/stargazer/innovativeMechanisms";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  entropySignature: EntropySignature | null;
  resonancePredictions?: ResonancePrediction[];
}

export default function EntropySignatureCard({
  entropySignature,
  resonancePredictions,
}: Props) {
  const { theme } = useArchetypeTheme();
  const [showDetails, setShowDetails] = useState(false);
  const [showResonance, setShowResonance] = useState(false);

  if (!theme || !entropySignature) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  // 構造タイプのアイコンと色
  const typeConfig: Record<
    EntropySignature["structureType"],
    { icon: string; label: string; color: string }
  > = {
    crystallized: { icon: "💎", label: "結晶型", color: accent },
    fluid: { icon: "💧", label: "流動型", color: primary },
    fragmented: { icon: "🔮", label: "モザイク型", color: "#9F7AEA" },
    evolving: { icon: "🦋", label: "変態型", color: "#F6AD55" },
  };

  const config = typeConfig[entropySignature.structureType];

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: theme.gradient.card,
        border: `1px solid ${border}`,
        backdropFilter: `blur(${theme.glassEffect.blur})`,
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-xs font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: hexToRgba(text, 0.74) }}
          >
            Entropy Signature
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3 className="text-base font-medium mb-2" style={{ color: hexToRgba(text, 0.96) }}>
          性格のかたち — あなたの一貫性パターン
        </h3>

        {/* Structure Type Hero */}
        <motion.div
          className="rounded-xl p-4 mb-4"
          style={{
            background: hexToRgba(config.color, 0.06),
            border: `1px solid ${hexToRgba(config.color, 0.15)}`,
          }}
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{config.icon}</span>
            <div>
              <span
                className="text-sm font-medium block"
                style={{ color: hexToRgba(text, 0.96) }}
              >
                {config.label}
              </span>
              <span
                className="text-xs font-mono"
                style={{ color: hexToRgba(text, 0.78) }}
              >
                {entropySignature.archetype}
              </span>
            </div>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: hexToRgba(text, 0.9) }}
          >
            {entropySignature.interpretation}
          </p>

          {/* Overall Entropy Gauge */}
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs" style={{ color: hexToRgba(text, 0.78) }}>
              一貫性
            </span>
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ background: hexToRgba(primary, 0.06) }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(1 - entropySignature.overallEntropy) * 100}%`,
                  background: `linear-gradient(90deg, ${hexToRgba(config.color, 0.4)}, ${hexToRgba(config.color, 0.7)})`,
                }}
              />
            </div>
            <span className="text-xs" style={{ color: hexToRgba(text, 0.78) }}>
              変わりやすさ
            </span>
          </div>
        </motion.div>

        {/* Axis Entropy Detail */}
        {entropySignature.axisEntropy.length > 0 && (
          <div
            className="rounded-xl overflow-hidden cursor-pointer mb-3"
            style={{
              background: hexToRgba(primary, 0.03),
              border: `1px solid ${hexToRgba(border, 0.3)}`,
            }}
            onClick={() => setShowDetails(!showDetails)}
          >
            <div className="p-3 flex items-center gap-2">
              <span className="text-xs">📊</span>
              <span
                className="text-sm font-medium flex-1"
                style={{ color: hexToRgba(text, 0.94) }}
              >
                項目ごとの変動しやすさ
              </span>
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: hexToRgba(accent, 0.08),
                  color: accent,
                }}
              >
                {entropySignature.axisEntropy.length}
              </span>
              <motion.span
                className="text-sm"
                style={{ color: hexToRgba(text, 0.76) }}
                animate={{ rotate: showDetails ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ▸
              </motion.span>
            </div>
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  className="px-3 pb-3 space-y-2"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {entropySignature.axisEntropy.slice(0, 8).map((ae, i) => (
                    <div key={ae.axisId} className="flex items-center gap-2">
                      <span
                        className="text-xs w-20 truncate"
                        style={{ color: hexToRgba(text, 0.78) }}
                      >
                        {ae.axisId.replace(/_/g, " ").slice(0, 12)}
                      </span>
                      <div
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: hexToRgba(primary, 0.06) }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background:
                              ae.entropy > 0.6
                                ? hexToRgba("#F6AD55", 0.6)
                                : ae.entropy > 0.3
                                  ? hexToRgba(primary, 0.4)
                                  : hexToRgba(accent, 0.4),
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${ae.entropy * 100}%` }}
                          transition={{ delay: i * 0.05 }}
                        />
                      </div>
                      <span
                        className="text-xs font-mono w-9 text-right"
                        style={{ color: hexToRgba(text, 0.78) }}
                      >
                        {(ae.entropy * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Resonance Predictions */}
        {resonancePredictions && resonancePredictions.length > 0 && (
          <div
            className="rounded-xl overflow-hidden cursor-pointer"
            style={{
              background: hexToRgba(primary, 0.03),
              border: `1px solid ${hexToRgba(border, 0.3)}`,
            }}
            onClick={() => setShowResonance(!showResonance)}
          >
            <div className="p-3 flex items-center gap-2">
              <span className="text-xs">🔗</span>
              <span
                className="text-sm font-medium flex-1"
                style={{ color: hexToRgba(text, 0.94) }}
              >
                まだ見えていない傾向の予測
              </span>
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: hexToRgba(accent, 0.08),
                  color: accent,
                }}
              >
                {resonancePredictions.length}
              </span>
              <motion.span
                className="text-sm"
                style={{ color: hexToRgba(text, 0.76) }}
                animate={{ rotate: showResonance ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ▸
              </motion.span>
            </div>
            <AnimatePresence>
              {showResonance && (
                <motion.div
                  className="px-3 pb-3 space-y-2"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {resonancePredictions
                    .filter((p) => p.isUnobserved)
                    .slice(0, 5)
                    .map((prediction, i) => (
                      <div
                        key={prediction.predictedAxis}
                        className="rounded-lg p-2.5"
                        style={{
                          background: hexToRgba(accent, 0.04),
                          border: `1px dashed ${hexToRgba(accent, 0.12)}`,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-medium"
                            style={{ color: hexToRgba(text, 0.94) }}
                          >
                            {prediction.predictedAxis
                              .replace(/_/g, " ")
                              .slice(0, 20)}
                          </span>
                          <span
                            className="text-xs font-mono ml-auto"
                            style={{ color: accent }}
                          >
                            {prediction.predictedScore > 0 ? "+" : ""}
                            {prediction.predictedScore.toFixed(2)}
                          </span>
                        </div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: hexToRgba(text, 0.82) }}
                        >
                          {prediction.resonanceSource}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {[...Array(3)].map((_, ci) => (
                            <div
                              key={ci}
                              className="w-1 h-1 rounded-full"
                              style={{
                                background:
                                  ci < Math.ceil(prediction.confidence * 3)
                                    ? accent
                                    : hexToRgba(primary, 0.15),
                              }}
                            />
                          ))}
                          <span
                            className="text-xs ml-1"
                            style={{ color: hexToRgba(text, 0.78) }}
                          >
                            確からしさ
                          </span>
                        </div>
                      </div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
