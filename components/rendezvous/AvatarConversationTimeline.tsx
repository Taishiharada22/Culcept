"use client";

/**
 * AvatarConversationTimeline
 * 分身同士の会話記録を美しいタイムラインで表示するコンポーネント
 *
 * 各エントリ:
 * - タイムスタンプ
 * - 話し合ったトピック（抽象化）
 * - 会話から得たインサイト
 * - ムードインジケータ (warm/neutral/exciting/deep/playful)
 */

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  type AvatarInteractionData,
  type AvatarConversationEntry,
  type ConversationMood,
  generateConversationSummary,
  generateOverallNuance,
} from "@/lib/rendezvous/avatarConversationSummary";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

type Props = {
  /** 分身の接触データ */
  interactionData: AvatarInteractionData;
  /** レポートを見るボタンのコールバック */
  onViewReport?: () => void;
  /** 閉じるコールバック */
  onClose?: () => void;
};

// ────────────────────────────────────────────
// ムードの色・アイコンマッピング
// ────────────────────────────────────────────
const MOOD_CONFIG: Record<
  ConversationMood,
  { color: string; bg: string; icon: string; label: string }
> = {
  warm: {
    color: "#EC4899",
    bg: "rgba(236,72,153,0.08)",
    icon: "🌸",
    label: "温かい",
  },
  neutral: {
    color: "#6366F1",
    bg: "rgba(99,102,241,0.06)",
    icon: "🔵",
    label: "穏やか",
  },
  exciting: {
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.08)",
    icon: "✨",
    label: "ワクワク",
  },
  deep: {
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.08)",
    icon: "🌌",
    label: "深い",
  },
  playful: {
    color: "#22C55E",
    bg: "rgba(34,197,94,0.08)",
    icon: "🎈",
    label: "楽しい",
  },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${h}:${m}`;
}

// ────────────────────────────────────────────
// TimelineEntry
// ────────────────────────────────────────────
function TimelineEntry({
  entry,
  index,
  isLast,
}: {
  entry: AvatarConversationEntry;
  index: number;
  isLast: boolean;
}) {
  const mood = MOOD_CONFIG[entry.mood];

  return (
    <FadeInView delay={index * 0.08} direction="up">
      <div
        style={{
          display: "flex",
          gap: 16,
          position: "relative",
          paddingBottom: isLast ? 0 : 24,
        }}
      >
        {/* タイムラインの線とドット */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 24,
            flexShrink: 0,
          }}
        >
          {/* ドット */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              delay: index * 0.1 + 0.2,
              type: "spring",
              stiffness: 500,
              damping: 25,
            }}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${mood.color}, ${mood.color}88)`,
              boxShadow: `0 0 12px ${mood.color}40`,
              zIndex: 2,
              flexShrink: 0,
            }}
          />
          {/* 接続線 */}
          {!isLast && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "100%" }}
              transition={{ delay: index * 0.1 + 0.3, duration: 0.3 }}
              style={{
                width: 2,
                background: `linear-gradient(180deg, ${mood.color}30, rgba(99,102,241,0.08))`,
                flex: 1,
                minHeight: 20,
              }}
            />
          )}
        </div>

        {/* コンテンツ */}
        <div style={{ flex: 1, paddingTop: -2 }}>
          {/* タイムスタンプ */}
          <div
            style={{
              fontSize: 10,
              color: "rgba(30,30,60,0.35)",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            {formatTimestamp(entry.timestamp)}
          </div>

          {/* トピックカード */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(99,102,241,0.06)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* トピックラベル */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{mood.icon}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1E1E3C",
                  lineHeight: 1.4,
                }}
              >
                {entry.topicLabel}
              </span>
            </div>

            {/* サマリー */}
            <p
              style={{
                fontSize: 12,
                color: "rgba(30,30,60,0.6)",
                margin: "0 0 6px",
                lineHeight: 1.6,
                paddingLeft: 22,
              }}
            >
              {entry.summary}
            </p>

            {/* インサイトバッジ */}
            {entry.insight && (
              <div style={{ paddingLeft: 22 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: mood.color,
                    background: mood.bg,
                    padding: "3px 10px",
                    borderRadius: 12,
                  }}
                >
                  → {entry.insight}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </FadeInView>
  );
}

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────
export default function AvatarConversationTimeline({
  interactionData,
  onViewReport,
  onClose,
}: Props) {
  const entries = useMemo(
    () => generateConversationSummary(interactionData),
    [interactionData],
  );

  const overallNuance = useMemo(
    () =>
      generateOverallNuance(entries, interactionData.overallSignal),
    [entries, interactionData.overallSignal],
  );

  const isComplete = !!interactionData.completedAt;

  return (
    <GlassCard variant="elevated" padding="none">
      {/* ヘッダー */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid rgba(99,102,241,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "#1E1E3C",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.08))",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                🪞
              </span>
              あなたの分身の会話記録
            </h3>
            <p
              style={{
                fontSize: 12,
                color: "rgba(30,30,60,0.45)",
                margin: "4px 0 0",
              }}
            >
              {overallNuance}
            </p>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(30,30,60,0.04)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "rgba(30,30,60,0.3)",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* ステータスバッジ */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <GlassBadge
            variant={isComplete ? "success" : "info"}
            size="sm"
          >
            {isComplete ? "接触完了" : "接触中..."}
          </GlassBadge>
          <GlassBadge variant="secondary" size="sm">
            {entries.length} トピック
          </GlassBadge>
          {interactionData.overallSignal === "strong" && (
            <GlassBadge variant="gradient" size="sm">
              高い相性
            </GlassBadge>
          )}
        </div>
      </div>

      {/* タイムライン */}
      <div
        style={{
          padding: "20px 20px 16px",
          maxHeight: 400,
          overflowY: "auto",
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "rgba(30,30,60,0.4)",
            }}
          >
            <motion.div
              animate={{
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ fontSize: 32, marginBottom: 12 }}
            >
              🔮
            </motion.div>
            <p style={{ fontSize: 13, margin: 0 }}>
              分身同士が接触を開始しました...
            </p>
            <p
              style={{
                fontSize: 11,
                color: "rgba(30,30,60,0.3)",
                marginTop: 4,
              }}
            >
              会話が進むとここに記録が表示されます
            </p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              index={i}
              isLast={i === entries.length - 1}
            />
          ))
        )}
      </div>

      {/* レポートボタン */}
      {isComplete && onViewReport && (
        <div
          style={{
            padding: "0 20px 20px",
          }}
        >
          <GlassButton
            variant="gradient"
            fullWidth
            onClick={onViewReport}
          >
            レポートを見る
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );
}
