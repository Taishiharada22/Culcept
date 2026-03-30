"use client";

/**
 * GameSelector
 * チャット内からカップルゲームを選択するUI
 * - 関係フェーズに基づいて利用可能なゲームをフィルタリング
 * - カテゴリタブでフィルタ
 * - ゲームカード（タイトル、説明、所要時間、フォーマットアイコン）
 * - タップで相手にゲーム招待を送信
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  type CoupleGame,
  type GameCategory,
  type RelationshipPhase,
  getAvailableGames,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  FORMAT_LABELS,
  getGameCountByCategory,
} from "@/lib/rendezvous/coupleGames";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";

type Props = {
  /** 現在の関係フェーズ */
  currentPhase: RelationshipPhase;
  /** ゲームが選択された時のコールバック */
  onSelectGame: (game: CoupleGame) => void;
  /** パネルを閉じるコールバック */
  onClose: () => void;
  /** 表示中かどうか */
  visible: boolean;
};

const ALL_CATEGORIES: (GameCategory | "all")[] = [
  "all",
  "icebreaker",
  "deepening",
  "playful",
  "challenge",
  "creative",
];

const categoryTabLabel = (cat: GameCategory | "all"): string => {
  if (cat === "all") return "すべて";
  return CATEGORY_LABELS[cat];
};

const categoryTabIcon = (cat: GameCategory | "all"): string => {
  if (cat === "all") return "🎲";
  return CATEGORY_ICONS[cat];
};

export default function GameSelector({
  currentPhase,
  onSelectGame,
  onClose,
  visible,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<
    GameCategory | "all"
  >("all");

  const categoryCounts = useMemo(
    () => getGameCountByCategory(currentPhase),
    [currentPhase],
  );

  const games = useMemo(() => {
    if (selectedCategory === "all") return getAvailableGames(currentPhase);
    return getAvailableGames(currentPhase, selectedCategory);
  }, [currentPhase, selectedCategory]);

  const handleSelect = useCallback(
    (game: CoupleGame) => {
      onSelectGame(game);
    },
    [onSelectGame],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            background:
              "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 50%, #FFF8F6 100%)",
          }}
        >
          {/* ヘッダー */}
          <div
            style={{
              padding: "16px 20px",
              background: "rgba(248,247,255,0.95)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid rgba(99,102,241,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#1E1E3C",
                  margin: 0,
                }}
              >
                ゲームで遊ぶ
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(30,30,60,0.45)",
                  margin: "2px 0 0",
                }}
              >
                {games.length} 個のゲームが利用可能
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "rgba(30,30,60,0.05)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: "rgba(30,30,60,0.4)",
              }}
            >
              ✕
            </button>
          </div>

          {/* カテゴリタブ */}
          <div
            style={{
              padding: "12px 16px 8px",
              overflowX: "auto",
              display: "flex",
              gap: 8,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {ALL_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat;
              const count =
                cat === "all"
                  ? games.length
                  : categoryCounts[cat as GameCategory] ?? 0;

              return (
                <motion.button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 20,
                    border: isActive
                      ? "1px solid rgba(99,102,241,0.3)"
                      : "1px solid rgba(30,30,60,0.08)",
                    background: isActive
                      ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))"
                      : "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#6366F1" : "rgba(30,30,60,0.6)",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <span>{categoryTabIcon(cat)}</span>
                  <span>{categoryTabLabel(cat)}</span>
                  {count > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: isActive
                          ? "rgba(99,102,241,0.2)"
                          : "rgba(30,30,60,0.06)",
                        padding: "1px 6px",
                        borderRadius: 10,
                        color: isActive
                          ? "#6366F1"
                          : "rgba(30,30,60,0.4)",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* ゲーム一覧 */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 16px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <AnimatePresence mode="popLayout">
              {games.map((game, i) => (
                <GameCard
                  key={game.id}
                  game={game}
                  index={i}
                  onSelect={handleSelect}
                />
              ))}
            </AnimatePresence>

            {games.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "rgba(30,30,60,0.4)",
                  fontSize: 13,
                }}
              >
                このカテゴリにはまだゲームがありません
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────
// GameCard
// ────────────────────────────────────────────

function GameCard({
  game,
  index,
  onSelect,
}: {
  game: CoupleGame;
  index: number;
  onSelect: (game: CoupleGame) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
    >
      <GlassCard
        onClick={() => onSelect(game)}
        padding="sm"
        hoverEffect
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* アイコン */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(236,72,153,0.06))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              flexShrink: 0,
            }}
          >
            {game.icon}
          </div>

          {/* コンテンツ */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#1E1E3C",
                  margin: 0,
                }}
              >
                {game.titleJa}
              </h3>
            </div>

            <p
              style={{
                fontSize: 12,
                color: "rgba(30,30,60,0.55)",
                margin: "0 0 8px",
                lineHeight: 1.5,
              }}
            >
              {game.descriptionJa}
            </p>

            {/* メタ情報 */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* 所要時間 */}
              <GlassBadge variant="info" size="sm">
                {game.duration}分
              </GlassBadge>

              {/* フォーマット */}
              <GlassBadge variant="secondary" size="sm">
                {FORMAT_LABELS[game.format]}
              </GlassBadge>

              {/* カテゴリ */}
              <GlassBadge variant="default" size="sm">
                {CATEGORY_ICONS[game.category]}{" "}
                {CATEGORY_LABELS[game.category]}
              </GlassBadge>

              {/* 質問数 */}
              {game.questions && game.questions.length > 0 && (
                <GlassBadge variant="success" size="sm">
                  {game.questions.length}問
                </GlassBadge>
              )}
            </div>
          </div>

          {/* 開始ボタン矢印 */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, #6366F1, #8B5CF6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              alignSelf: "center",
              boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M3 7h8M8 3l3 4-3 4"
                stroke="#fff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
