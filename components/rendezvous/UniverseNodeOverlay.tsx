"use client";

/**
 * UniverseNodeOverlay
 * タップ時のGlassCardオーバーレイ
 * ノードの詳細情報を表示 (sync ring, badges, 2 CTAs)
 */

import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import type { ConnectionNode } from "./ConnectionUniverse";

type Props = {
  node: ConnectionNode;
  onClose: () => void;
  onNavigate: (candidateId: string) => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  romantic: "恋愛",
  friendship: "友人",
  cocreation: "共創",
  community: "繋がり",
};

const CATEGORY_COLORS: Record<string, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
};

const STATE_LABELS: Record<string, string> = {
  mutual_liked: "相互マッチ",
  chat_opened: "会話中",
  liked: "応答待ち",
  passed: "パス済み",
  expired: "期限切れ",
  dismissed: "非表示",
};

function SyncRing({
  percent,
  color,
  size = 48,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const strokeW = 3;
  const r = (size - strokeW) / 2;
  const circumference = r * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(30,30,60,0.06)"
        strokeWidth={strokeW}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
}

export default function UniverseNodeOverlay({
  node,
  onClose,
  onNavigate,
}: Props) {
  const color = CATEGORY_COLORS[node.category] ?? "#6366F1";
  const canChat =
    node.state === "mutual_liked" || node.state === "chat_opened";

  return (
    <AnimatePresence>
      {/* Backdrop -- tap outside to close */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(30,30,60,0.08)",
        }}
      />

      {/* Overlay card */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        style={{
          position: "fixed",
          bottom: 24,
          left: 16,
          right: 16,
          zIndex: 50,
          maxWidth: 400,
          margin: "0 auto",
        }}
      >
        <GlassCard variant="elevated" padding="md">
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 14,
              background: "none",
              border: "none",
              fontSize: 18,
              color: "rgba(30,30,60,0.25)",
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            x
          </button>

          {/* Header: avatar + info + sync ring */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            {/* Avatar with category color border */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: node.avatarUrl
                  ? `url(${node.avatarUrl}) center/cover`
                  : `linear-gradient(135deg, ${color}25, ${color}08)`,
                border: `2.5px solid ${color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                color,
                flexShrink: 0,
              }}
            >
              {!node.avatarUrl && node.name.slice(0, 2)}
            </div>

            {/* Name + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#1E1E3C",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {node.name}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <GlassBadge size="sm">
                  <span style={{ color }}>{CATEGORY_LABELS[node.category] ?? node.category}</span>
                </GlassBadge>
                <GlassBadge size="sm" variant="secondary">
                  {STATE_LABELS[node.state] ?? node.state}
                </GlassBadge>
              </div>
            </div>

            {/* Sync ring */}
            <div
              style={{
                position: "relative",
                flexShrink: 0,
                width: 48,
                height: 48,
              }}
            >
              <SyncRing percent={node.syncPercent} color={color} size={48} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color,
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    lineHeight: 1,
                  }}
                >
                  {node.syncPercent}
                </span>
                <span
                  style={{
                    fontSize: 7,
                    color: "rgba(30,30,60,0.3)",
                    marginTop: 1,
                  }}
                >
                  SYNC
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              padding: "10px 0",
              margin: "12px 0",
              borderTop: "1px solid rgba(30,30,60,0.06)",
              borderBottom: "1px solid rgba(30,30,60,0.06)",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "rgba(30,30,60,0.7)",
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}
              >
                {node.messageCount}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(30,30,60,0.35)",
                  marginLeft: 3,
                }}
              >
                通
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: node.isActive ? "#22C55E" : "rgba(30,30,60,0.2)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: node.isActive
                    ? "#22C55E"
                    : "rgba(30,30,60,0.35)",
                }}
              >
                {node.isActive ? "アクティブ" : "非アクティブ"}
              </span>
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 8 }}>
            <GlassButton
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => onNavigate(node.id)}
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                boxShadow: `0 2px 8px ${color}25`,
              }}
            >
              詳細を見る
            </GlassButton>
            {canChat && (
              <GlassButton
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => onNavigate(node.id)}
              >
                会話へ
              </GlassButton>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
}
