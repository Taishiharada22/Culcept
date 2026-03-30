// app/stargazer/_components/MirrorMomentCard.tsx
// カテゴリ完了後の「鏡の瞬間」— 蓄積された回答から短い観測断片を表示
// 「理解されている」感覚を生み出し、次のカテゴリでより正直な回答を引き出す
// 原則: 評価しない。映し返す。断定しない。傾向を提示する
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  /** 観測テキスト */
  observation: string;
  /** カテゴリの絵文字 */
  categoryEmoji: string;
  /** カテゴリのアクセントカラー */
  accentColor: string;
  /** 次のカテゴリへ進むコールバック */
  onContinue: () => void;
  lightMode?: boolean;
}

export default function MirrorMomentCard({
  observation,
  categoryEmoji,
  accentColor,
  onContinue,
  lightMode = false,
}: Props) {
  const [showContinue, setShowContinue] = useState(false);

  useEffect(() => {
    // 2.5秒後に「続ける」ボタンを表示 — 観測を読む時間を確保
    const timer = setTimeout(() => setShowContinue(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const textPrimary = "rgba(30,40,60,0.85)";
  const textTertiary = "rgba(120,125,140,0.35)";

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* 背景グロウ */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${accentColor.replace(/[\d.]+\)$/, "0.04)")} 0%, transparent 60%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      />

      {/* 観測アイコン — ゆっくり回転して存在感 */}
      <motion.div
        className="relative mb-6"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          delay: 0.3,
          type: "spring",
          stiffness: 150,
          damping: 12,
        }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: accentColor.replace(/[\d.]+\)$/, "0.06)"),
            border: `1px solid ${accentColor.replace(/[\d.]+\)$/, "0.12)")}`,
            boxShadow: `0 0 24px ${accentColor.replace(/[\d.]+\)$/, "0.08)")}`,
          }}
        >
          <span className="text-xl">{categoryEmoji}</span>
        </div>
      </motion.div>

      {/* ラベル */}
      <motion.p
        className="font-mono-sg text-[9px] tracking-[0.3em] uppercase mb-5"
        style={{ color: accentColor }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        観測の断片
      </motion.p>

      {/* 観測テキスト — メインの鏡 */}
      <motion.p
        className="font-body text-sm leading-[1.8] max-w-xs mb-8"
        style={{ color: textPrimary }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.4 }}
      >
        {observation}
      </motion.p>

      {/* ヒント — これが評価ではないことを伝える */}
      <motion.p
        className="font-body text-xs leading-relaxed max-w-xs mb-8"
        style={{ color: textTertiary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        ※ これはここまでの回答から見えた傾向の断片です
      </motion.p>

      {/* 続けるボタン — 遅延表示 */}
      <AnimatePresence>
        {showContinue && (
          <motion.button
            onClick={onContinue}
            className="px-6 py-2.5 rounded-xl font-body text-xs"
            style={{
              background: accentColor.replace(/[\d.]+\)$/, "0.06)"),
              border: `1px solid ${accentColor.replace(/[\d.]+\)$/, "0.12)")}`,
              color: accentColor,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            次の観測へ進む
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
