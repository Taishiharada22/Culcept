// VisualChoiceCard.tsx
// 🎨 ビジュアル・チョイス — 言語を使わない深層心理の観測
// 2枚の抽象画像から1枚を選ぶ。選んだ画像が星座の背景テクスチャに反映
"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

export interface VisualChoicePair {
  id: string; // e.g. "vc_01"
  /** 測定する軸 */
  axes: string[];
  imageA: string; // パス e.g. "/stargazer/visual-choice/vc_01_a.webp"
  imageB: string;
  /** A を選んだ場合の軸スコア方向 (-1〜+1) */
  axisWeightA: number;
  axisWeightB: number;
}

export interface VisualChoiceResult {
  pairId: string;
  selected: "A" | "B";
  responseTimeMs: number;
}

interface Props {
  pair: VisualChoicePair;
  onAnswer: (result: VisualChoiceResult) => void;
}

export default function VisualChoiceCard({ pair, onAnswer }: Props) {
  const [selected, setSelected] = useState<"A" | "B" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const shownAt = useRef(Date.now());

  const handleSelect = useCallback(
    (choice: "A" | "B") => {
      if (submitted) return;
      setSelected(choice);
      setSubmitted(true);

      const responseTimeMs = Date.now() - shownAt.current;

      // 吸い込まれるアニメーション → 0.8秒後にコールバック
      setTimeout(() => {
        onAnswer({ pairId: pair.id, selected: choice, responseTimeMs });
      }, 800);
    },
    [submitted, pair.id, onAnswer]
  );

  const textSecondary = "rgba(55,60,80,0.6)";
  const accent = "rgba(140,120,60,0.85)";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center relative"
    >
      {/* Badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm">🎨</span>
        <span
          className="font-mono-sg text-xs tracking-[0.2em] uppercase"
          style={{ color: accent }}
        >
          直感の選択
        </span>
      </div>

      {/* Instruction */}
      <motion.p
        className="font-body text-sm mb-8"
        style={{ color: textSecondary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        言葉ではなく、感覚で選んでください
      </motion.p>

      {/* Image pair */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        {(["A", "B"] as const).map((choice) => {
          const imageSrc = choice === "A" ? pair.imageA : pair.imageB;
          const isSelected = selected === choice;
          const isOther = selected !== null && selected !== choice;

          return (
            <motion.button
              key={choice}
              onClick={() => handleSelect(choice)}
              disabled={submitted}
              className="relative rounded-2xl overflow-hidden aspect-[3/2]"
              style={{
                border: isSelected
                  ? "2px solid rgba(140,120,60,0.4)"
                  : "1px solid rgba(140,150,180,0.12)",
                boxShadow: isSelected
                  ? "0 0 24px rgba(140,120,60,0.15)"
                  : "0 2px 8px rgba(0,0,0,0.04)",
              }}
              animate={{
                scale: isSelected ? 1.05 : isOther ? 0.9 : 1,
                opacity: isOther ? 0.3 : 1,
              }}
              whileHover={!submitted ? { scale: 1.03 } : {}}
              whileTap={!submitted ? { scale: 0.97 } : {}}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Image
                src={imageSrc}
                alt={`選択肢 ${choice}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 45vw, 200px"
              />
              {/* 選択時のグロウオーバーレイ */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background: "radial-gradient(circle, rgba(140,120,60,0.15), transparent 70%)",
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
