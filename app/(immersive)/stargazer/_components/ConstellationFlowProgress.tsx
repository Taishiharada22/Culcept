// ConstellationFlowProgress.tsx
// P1: テキスト進捗（X/Y問）の代わりに星座が浮かび上がるプログレス
// 質問を答えるごとに星が点灯し、星座の輪郭が浮かび上がる
"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  /** 現在の質問番号（0-based） */
  current: number;
  /** 全質問数 */
  total: number;
  /** チャプター名 */
  chapterLabel?: string;
  /** セーブ確認メッセージ（~10問目） */
  showSaveHint?: boolean;
  /** アカウント作成ヒント（~30問目、匿名ユーザーのみ表示） */
  showAccountHint?: boolean;
  /** 匿名ユーザーかどうか（false の場合 showAccountHint を無視） */
  isAnonymousUser?: boolean;
}

// 星座の星の位置（5チャプターを五角形に配置）
const STAR_POSITIONS = [
  { x: 50, y: 8 },   // Core Signal (top center)
  { x: 88, y: 38 },  // Relational Distance (right)
  { x: 74, y: 82 },  // Context Faces (bottom right)
  { x: 26, y: 82 },  // Motion & Tension (bottom left)
  { x: 12, y: 38 },  // Aesthetic & Expression (left)
];

// 各チャプターの質問数の累計（コア51問ベース）
const CHAPTER_BOUNDARIES = [0, 14, 24, 34, 42, 51];

function getChapterProgress(current: number) {
  const result = [];
  for (let i = 0; i < 5; i++) {
    const start = CHAPTER_BOUNDARIES[i];
    const end = CHAPTER_BOUNDARIES[i + 1];
    const total = end - start;
    const answered = Math.max(0, Math.min(total, current - start));
    result.push({
      progress: total > 0 ? answered / total : 0,
      complete: answered >= total,
      active: current >= start && current < end,
    });
  }
  return result;
}

export default function ConstellationFlowProgress({
  current,
  total,
  chapterLabel,
  showSaveHint = false,
  showAccountHint = false,
  isAnonymousUser = false,
}: Props) {
  // 30問目ヒントは匿名ユーザーのみ表示（既存ログイン済みユーザーには不要）
  const effectiveShowAccountHint = showAccountHint && isAnonymousUser;
  const chapters = getChapterProgress(current);
  const overallProgress = Math.min(1, (current + 1) / total);
  const activeChapterIndex = chapters.findIndex((ch) => ch.active) ?? 0;

  return (
    <div className="relative">
      {/* 星座 SVG */}
      <div className="flex items-center gap-3">
        <svg
          viewBox="0 0 100 90"
          className="w-16 h-14 flex-shrink-0"
          aria-hidden="true"
        >
          {/* 接続線 — 完了チャプター間を結ぶ */}
          {STAR_POSITIONS.map((pos, i) => {
            const next = STAR_POSITIONS[(i + 1) % 5];
            const isLit = chapters[i].complete;
            return (
              <motion.line
                key={`line-${i}`}
                x1={pos.x}
                y1={pos.y}
                x2={next.x}
                y2={next.y}
                stroke={
                  isLit
                    ? "rgba(190,170,110,0.35)"
                    : "rgba(160,170,200,0.08)"
                }
                strokeWidth={isLit ? 1 : 0.5}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: isLit ? 1 : 0.3,
                  opacity: isLit ? 1 : 0.4,
                }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              />
            );
          })}

          {/* 星 */}
          {STAR_POSITIONS.map((pos, i) => {
            const ch = chapters[i];
            const starSize = ch.complete ? 4.5 : ch.active ? 3.5 : 2;
            return (
              <g key={`star-${i}`}>
                {/* グロウ（完了 or アクティブ） */}
                {(ch.complete || ch.active) && (
                  <motion.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={ch.complete ? 8 : 6}
                    fill={
                      ch.complete
                        ? "rgba(190,170,110,0.12)"
                        : "rgba(190,170,110,0.06)"
                    }
                    initial={{ scale: 0 }}
                    animate={{
                      scale: ch.active ? [1, 1.3, 1] : 1,
                    }}
                    transition={
                      ch.active
                        ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.4 }
                    }
                  />
                )}
                {/* 星本体 */}
                <motion.circle
                  cx={pos.x}
                  cy={pos.y}
                  r={starSize}
                  fill={
                    ch.complete
                      ? "rgba(190,170,110,0.85)"
                      : ch.active
                        ? "rgba(190,170,110,0.6)"
                        : "rgba(160,170,200,0.15)"
                  }
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    delay: i * 0.05,
                  }}
                />
                {/* 進捗リング（アクティブチャプター） */}
                {ch.active && ch.progress > 0 && (
                  <motion.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={6}
                    fill="none"
                    stroke="rgba(190,170,110,0.5)"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    strokeDasharray={37.7}
                    strokeDashoffset={37.7 * (1 - ch.progress)}
                    transform={`rotate(-90 ${pos.x} ${pos.y})`}
                    initial={{ strokeDashoffset: 37.7 }}
                    animate={{ strokeDashoffset: 37.7 * (1 - ch.progress) }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* 右側: チャプター名 + 章番号 + 薄い進捗バー */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {chapterLabel && (
              <p
                className="font-mono-sg text-[10px] tracking-[0.15em] uppercase truncate"
                style={{ color: "rgba(120,125,140,0.5)" }}
              >
                {chapterLabel}
              </p>
            )}
            <span
              className="font-mono-sg text-[9px] tabular-nums flex-shrink-0"
              style={{ color: "rgba(120,125,140,0.3)" }}
            >
              {activeChapterIndex + 1} / 5
            </span>
          </div>
          {/* 全体進捗バー */}
          <div
            className="h-[2px] rounded-full overflow-hidden"
            style={{ background: "rgba(160,170,200,0.10)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: "rgba(190,170,110,0.45)" }}
              animate={{ width: `${overallProgress * 100}%` }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* セーブ確認ヒント (~10問目) */}
      <AnimatePresence>
        {showSaveHint && (
          <motion.div
            className="mt-2 flex items-center gap-1.5"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[10px]">✓</span>
            <span
              className="font-mono-sg text-[10px] tracking-wider"
              style={{ color: "rgba(80,180,120,0.55)" }}
            >
              回答は自動保存されています
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* アカウントヒント (~30問目) */}
      <AnimatePresence>
        {effectiveShowAccountHint && (
          <motion.div
            className="mt-2 flex items-center gap-1.5"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-[10px]">🔒</span>
            <span
              className="font-mono-sg text-[10px] tracking-wider"
              style={{ color: "rgba(140,120,60,0.45)" }}
            >
              観測後にアカウントを作ると、結果を確実に引き継げます
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
