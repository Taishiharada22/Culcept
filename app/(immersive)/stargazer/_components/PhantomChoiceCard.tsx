// app/stargazer/_components/PhantomChoiceCard.tsx
// 幻影選択カード — 選ばなかった選択肢から見えるもう一人の自分
"use client";

import { motion } from "framer-motion";
import type { PhantomChoiceResult } from "@/lib/stargazer/innovativeMechanisms";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  phantomChoices: PhantomChoiceResult[];
}

export default function PhantomChoiceCard({ phantomChoices }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || phantomChoices.length === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

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
            Phantom Choice
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-base font-medium mb-1"
          style={{ color: hexToRgba(text, 0.96) }}
        >
          迷いの記録 — 選ばなかったもう一つの答え
        </h3>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          迷ったり選び直したりした回答には、あなたの本音が隠れています。
        </p>

        <div className="space-y-3">
          {phantomChoices.map((choice, i) => {
            const hasPhantom = !!choice.phantomOption;
            const accentColor = hasPhantom ? "#9F7AEA" : accent;

            return (
              <motion.div
                key={`${choice.questionId}-${i}`}
                className="rounded-xl p-3.5"
                style={{
                  background: hexToRgba(accentColor, 0.04),
                  border: `1px solid ${hexToRgba(accentColor, 0.12)}`,
                }}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                {/* Choice flow */}
                <div className="flex items-center gap-2 mb-2">
                  {hasPhantom ? (
                    <>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: hexToRgba(accentColor, 0.12),
                          color: accentColor,
                          textDecoration: "line-through",
                          opacity: 0.6,
                        }}
                      >
                        {choice.phantomOption}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: hexToRgba(text, 0.76) }}
                      >
                        →
                      </span>
                    </>
                  ) : null}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: hexToRgba(accent, 0.1),
                      color: accent,
                    }}
                  >
                    {choice.chosenOption}
                  </span>
                  {hasPhantom && (
                    <span
                      className="text-xs font-mono ml-auto"
                      style={{ color: accentColor, opacity: 0.6 }}
                    >
                      選び直し
                    </span>
                  )}
                </div>

                {/* Insight */}
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: hexToRgba(text, 0.9) }}
                >
                  {choice.phantomInsight}
                </p>

                {/* Axis influence hint */}
                {choice.phantomAxisInfluence && (
                  <div className="flex items-center gap-1 mt-2">
                    <div
                      className="w-1 h-1 rounded-full"
                      style={{ background: accentColor }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: hexToRgba(text, 0.8) }}
                    >
                      {choice.phantomAxisInfluence.axisId.replace(/_/g, " ")} に
                      {choice.phantomAxisInfluence.direction > 0 ? "+" : "−"}
                      に影響
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Summary */}
        <div
          className="mt-4 p-3 rounded-lg text-center"
          style={{
            background: hexToRgba(primary, 0.03),
            border: `1px dashed ${hexToRgba(border, 0.3)}`,
          }}
        >
          <p
            className="text-xs leading-relaxed"
            style={{ color: hexToRgba(text, 0.82) }}
          >
            {phantomChoices.filter((c) => c.phantomOption).length}件の選択変更と
            {phantomChoices.filter((c) => !c.phantomOption).length}件の長考を検出。
            迷いは弱さではなく、あなたの中にいろんな面がある証拠です。
          </p>
        </div>
      </div>
    </motion.div>
  );
}
