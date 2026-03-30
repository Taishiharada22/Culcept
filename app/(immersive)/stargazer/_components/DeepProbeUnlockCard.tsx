// app/stargazer/_components/DeepProbeUnlockCard.tsx
// Stage 1 完了後に表示される Stage 2 解放カード
"use client";

import { motion } from "framer-motion";
import {
  PROBE_CONTEXT_COLORS,
  PROBE_THEMES,
  type ProbeTheme,
} from "@/lib/stargazer/stage2Probes";

interface Props {
  completedThemeIds?: string[];
  onStart: () => void;
  lightMode?: boolean;
}

export default function DeepProbeUnlockCard({
  completedThemeIds = [],
  onStart,
  lightMode = true,
}: Props) {
  const totalThemes = PROBE_THEMES.length;
  const completedCount = completedThemeIds.length;
  const allDone = completedCount >= totalThemes;

  const textPrimary = lightMode
    ? "rgba(30,40,60,0.85)"
    : "rgba(30,40,60,0.85)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.6)"
    : "rgba(100,105,130,0.6)";
  const textTertiary = lightMode
    ? "rgba(80,90,110,0.4)"
    : "rgba(120,125,140,0.4)";

  const cardBg = lightMode
    ? "rgba(255,255,255,0.7)"
    : "rgba(255,255,255,0.7)";
  const cardBorder = lightMode
    ? "rgba(160,170,200,0.12)"
    : "rgba(160,170,200,0.12)";

  if (allDone) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.25 }}
      className="rounded-2xl p-6 sm:p-8 relative overflow-hidden"
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        backdropFilter: "blur(16px)",
      }}
    >
      {/* グロー背景 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: lightMode
            ? "radial-gradient(ellipse at 30% 20%, rgba(168,85,247,0.04) 0%, transparent 60%)"
            : "radial-gradient(ellipse at 30% 20%, rgba(168,85,247,0.06) 0%, transparent 60%)",
        }}
      />

      <div className="relative">
        {/* ヘッダー */}
        <div className="flex items-center gap-2 mb-4">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ background: "rgba(168,85,247,0.6)" }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span
            className="font-mono-sg text-xs tracking-[0.2em] uppercase"
            style={{ color: "rgba(168,85,247,0.6)" }}
          >
            深層プローブ
          </span>
        </div>

        {/* メインテキスト */}
        <h3
          className="font-display text-lg font-semibold mb-2"
          style={{ color: textPrimary }}
        >
          {completedCount > 0
            ? "深層観測を続ける"
            : "より深い観測を解放する"}
        </h3>
        <p
          className="font-body text-sm leading-relaxed mb-5"
          style={{ color: textSecondary }}
        >
          {completedCount > 0
            ? `${completedCount}/${totalThemes}テーマ完了。残りのテーマで、より深い傾向を観測します。`
            : "5ステップの深掘り質問で、関係性の中での反応構造を観測します。一つの回答で評価しません。"}
        </p>

        {/* テーマプレビュー */}
        <div className="flex flex-wrap gap-2 mb-6">
          {PROBE_THEMES.map((theme) => {
            const isDone = completedThemeIds.includes(theme.id);
            const color = PROBE_CONTEXT_COLORS[theme.context];
            return (
              <div
                key={theme.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: isDone ? "transparent" : color.bg,
                  border: `1px solid ${isDone ? (lightMode ? "rgba(0,0,0,0.04)" : "rgba(160,170,200,0.1)") : color.accent.replace("0.8", "0.15")}`,
                  opacity: isDone ? 0.4 : 1,
                }}
              >
                <span className="text-xs">{theme.emoji}</span>
                <span
                  className="font-body text-xs"
                  style={{
                    color: isDone ? textTertiary : color.accent,
                  }}
                >
                  {theme.title}
                </span>
                {isDone && (
                  <span className="text-[9px]" style={{ color: "rgba(74,222,128,0.5)" }}>
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 進捗バー */}
        {completedCount > 0 && (
          <div className="mb-5">
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{
                background: lightMode
                  ? "rgba(0,0,0,0.04)"
                  : "rgba(160,170,200,0.1)",
              }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(168,85,247,0.5), rgba(190,170,110,0.5))",
                }}
                initial={{ width: 0 }}
                animate={{
                  width: `${(completedCount / totalThemes) * 100}%`,
                }}
                transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* CTA */}
        <motion.button
          onClick={onStart}
          className="w-full py-3 rounded-xl font-body text-sm font-semibold transition-all"
          style={{
            background: lightMode
              ? "rgba(168,85,247,0.08)"
              : "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.2)",
            color: "rgba(168,85,247,0.8)",
          }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
        >
          {completedCount > 0 ? "深層観測を続ける" : "深層観測を始める"}
        </motion.button>
      </div>
    </motion.div>
  );
}
