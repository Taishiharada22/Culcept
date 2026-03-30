"use client";

/**
 * RendezvousSwipeStack
 * Tinder/Tapple風スワイプカードスタック
 *
 * - 3枚重ねカードスタック（トップがアクティブ、後方2枚はスケール縮小）
 * - 右スワイプ = Like、左 = Pass、上 = 保存
 * - 閾値: 100px水平ドラッグでアクション確定
 * - Undo機能
 * - カード表示: アバター > 名前+カテゴリ > sync% > reason chips
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence, PanInfo } from "framer-motion";
import type { RendezvousCardDTO, RendezvousCategory } from "@/lib/rendezvous/types";
import RendezvousSyncRing from "./RendezvousSyncRing";

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────

const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = 80;

const CATEGORY_LABEL: Record<RendezvousCategory, string> = {
  romantic: "恋愛",
  friendship: "友人",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};

const CATEGORY_COLOR: Record<RendezvousCategory, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

function getInitials(name: string): string {
  return name.slice(0, 2);
}

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type SwipeAction = "like" | "pass" | "save";

type Props = {
  items: RendezvousCardDTO[];
  onAction: (candidateId: string, action: SwipeAction) => void;
  onEmpty?: () => void;
};

type UndoEntry = {
  card: RendezvousCardDTO;
  action: SwipeAction;
};

// ────────────────────────────────────────────
// Overlay Indicators
// ────────────────────────────────────────────

function ActionOverlay({ direction, progress }: { direction: "left" | "right" | "up"; progress: number }) {
  const opacity = Math.min(progress, 1);
  if (opacity < 0.1) return null;

  const config = {
    left: { text: "見送る", color: "#EF4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)" },
    right: { text: "気になる", color: "#22C55E", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.3)" },
    up: { text: "保存", color: "#6366F1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.3)" },
  };
  const c = config[direction];

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        ...(direction === "left" ? { right: 16 } : direction === "right" ? { left: 16 } : { left: "50%", transform: "translateX(-50%)" }),
        padding: "6px 16px",
        borderRadius: 8,
        fontWeight: 800,
        fontSize: 18,
        color: c.color,
        background: c.bg,
        border: `2px solid ${c.border}`,
        opacity,
        zIndex: 10,
        pointerEvents: "none" as const,
        letterSpacing: 1,
      }}
    >
      {c.text}
    </div>
  );
}

// ────────────────────────────────────────────
// Single Swipeable Card
// ────────────────────────────────────────────

function SwipeCard({
  card,
  isTop,
  stackIndex,
  onSwipe,
}: {
  card: RendezvousCardDTO;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (action: SwipeAction) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);

  // Overlay progress
  const rightProgress = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const leftProgress = useTransform(x, [0, -SWIPE_THRESHOLD], [0, 1]);
  const upProgress = useTransform(y, [0, -SWIPE_UP_THRESHOLD], [0, 1]);

  const [overlay, setOverlay] = useState<{ direction: "left" | "right" | "up"; progress: number }>({
    direction: "right",
    progress: 0,
  });

  useEffect(() => {
    const unsubX = x.on("change", (latest) => {
      const yVal = y.get();
      if (Math.abs(latest) > Math.abs(yVal)) {
        setOverlay({
          direction: latest > 0 ? "right" : "left",
          progress: Math.abs(latest) / SWIPE_THRESHOLD,
        });
      }
    });
    const unsubY = y.on("change", (latest) => {
      const xVal = x.get();
      if (Math.abs(latest) > Math.abs(xVal) && latest < 0) {
        setOverlay({
          direction: "up",
          progress: Math.abs(latest) / SWIPE_UP_THRESHOLD,
        });
      }
    });
    return () => { unsubX(); unsubY(); };
  }, [x, y]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;
      const absX = Math.abs(offset.x);
      const absY = Math.abs(offset.y);
      const fastEnough = Math.abs(velocity.x) > 500 || Math.abs(velocity.y) > 500;

      // Up swipe = save
      if (offset.y < -SWIPE_UP_THRESHOLD && absY > absX) {
        onSwipe("save");
        return;
      }
      // Right swipe = like
      if (offset.x > SWIPE_THRESHOLD || (offset.x > 60 && fastEnough)) {
        onSwipe("like");
        return;
      }
      // Left swipe = pass
      if (offset.x < -SWIPE_THRESHOLD || (offset.x < -60 && fastEnough)) {
        onSwipe("pass");
        return;
      }
      // Reset
      setOverlay({ direction: "right", progress: 0 });
    },
    [onSwipe],
  );

  const catColor = CATEGORY_COLOR[card.category] ?? "#6366F1";
  const bestCtxColor = card.contextLens?.bestContext
    ? { friend: "#6366F1", romance: "#EC4899", orbiter: "#8B5CF6", cocreation: "#F59E0B" }[card.contextLens.bestContext] ?? catColor
    : catColor;

  // Stack scaling
  const scale = 1 - stackIndex * 0.05;
  const translateY = stackIndex * 8;

  return (
    <motion.div
      layout
      style={{
        position: "absolute",
        width: "100%",
        x: isTop ? x : 0,
        y: isTop ? y : translateY,
        rotate: isTop ? rotate : 0,
        scale,
        zIndex: 10 - stackIndex,
        touchAction: "none",
      }}
      drag={isTop}
      dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={{ scale: scale - 0.05, opacity: 0, y: translateY + 30 }}
      animate={{ scale, opacity: 1, y: translateY }}
      exit={{
        x: overlay.direction === "right" ? 400 : overlay.direction === "left" ? -400 : 0,
        y: overlay.direction === "up" ? -400 : 0,
        opacity: 0,
        transition: { duration: 0.3 },
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div
        style={{
          borderRadius: 20,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(99,102,241,0.08)",
          boxShadow: `0 4px 24px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.04)`,
          overflow: "hidden",
          position: "relative",
          minHeight: 340,
          padding: 0,
        }}
      >
        {/* Action overlay */}
        {isTop && <ActionOverlay direction={overlay.direction} progress={overlay.progress} />}

        {/* Avatar Hero Area */}
        <div
          style={{
            height: 180,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(180deg, ${bestCtxColor}08 0%, ${bestCtxColor}03 100%)`,
            position: "relative",
          }}
        >
          {/* Sync Ring (top-right) */}
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <RendezvousSyncRing
              percent={card.syncPercent}
              size={52}
              strokeWidth={3}
              color={bestCtxColor}
            />
          </div>

          {/* Avatar */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: card.counterpart.avatarUrl
                ? `url(${card.counterpart.avatarUrl}) center/cover`
                : `linear-gradient(135deg, ${bestCtxColor}25, ${bestCtxColor}08)`,
              border: `3px solid ${bestCtxColor}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800,
              color: bestCtxColor,
              marginBottom: 10,
            }}
          >
            {!card.counterpart.avatarUrl && getInitials(card.counterpart.displayName)}
          </div>

          {/* Name + Category */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1E1E3C", marginBottom: 4 }}>
              {card.counterpart.displayName}
            </div>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                color: catColor,
                background: `${catColor}12`,
              }}
            >
              {CATEGORY_LABEL[card.category]}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px 20px" }}>
          {/* Label */}
          {card.label && (
            <p
              style={{
                fontSize: 13,
                color: "rgba(30,30,60,0.55)",
                textAlign: "center",
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              {card.label}
            </p>
          )}

          {/* Reason chips */}
          {card.reasons.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 10 }}>
              {card.reasons.slice(0, 3).map((reason, i) => (
                <span
                  key={i}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    color: bestCtxColor,
                    background: `${bestCtxColor}08`,
                    border: `1px solid ${bestCtxColor}15`,
                  }}
                >
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Caution (subtle) */}
          {card.caution && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 6,
                background: "rgba(251,191,36,0.05)",
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>!</span>
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)", lineHeight: 1.4 }}>
                {card.caution}
              </span>
            </div>
          )}

          {/* Public summaries */}
          {card.counterpart.publicMoodSummary && (
            <p style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
              {card.counterpart.publicMoodSummary}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────
// Main Stack
// ────────────────────────────────────────────

export default function RendezvousSwipeStack({ items, onAction, onEmpty }: Props) {
  const [stack, setStack] = useState<RendezvousCardDTO[]>(items);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync items from parent
  useEffect(() => {
    setStack(items);
  }, [items]);

  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      if (stack.length === 0) return;
      const top = stack[0];
      setUndoStack((prev) => [...prev, { card: top, action }]);
      setStack((prev) => prev.slice(1));
      onAction(top.candidateId, action);

      if (stack.length <= 1) {
        onEmpty?.();
      }
    },
    [stack, onAction, onEmpty],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setStack((prev) => [last.card, ...prev]);
  }, [undoStack]);

  const handleButtonAction = useCallback(
    (action: SwipeAction) => {
      handleSwipe(action);
    },
    [handleSwipe],
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "ArrowRight") { e.preventDefault(); handleButtonAction("like"); }
      if (e.key === "ArrowLeft") { e.preventDefault(); handleButtonAction("pass"); }
      if (e.key === "ArrowUp") { e.preventDefault(); handleButtonAction("save"); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); handleUndo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleButtonAction, handleUndo]);

  const visibleCards = stack.slice(0, 3);

  return (
    <div>
      {/* Card stack area */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          height: 420,
          marginBottom: 16,
        }}
      >
        <AnimatePresence mode="popLayout">
          {visibleCards.map((card, i) => (
            <SwipeCard
              key={card.candidateId}
              card={card}
              isTop={i === 0}
              stackIndex={i}
              onSwipe={handleSwipe}
            />
          ))}
        </AnimatePresence>

        {/* Empty state */}
        {stack.length === 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(30,30,60,0.35)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>
              &#10024;
            </div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>新しい交差はまだありません</p>
            <p style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
              分身が見つけてきたら、ここに届きます
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {stack.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 8 }}>
          {/* Pass button */}
          <button
            onClick={() => handleButtonAction("pass")}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "2px solid rgba(239,68,68,0.2)",
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(239,68,68,0.08)",
            }}
            title="見送る (←)"
          >
            &#10006;
          </button>

          {/* Save button */}
          <button
            onClick={() => handleButtonAction("save")}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "2px solid rgba(99,102,241,0.2)",
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(99,102,241,0.08)",
              color: "#6366F1",
            }}
            title="保存 (↑)"
          >
            &#9734;
          </button>

          {/* Like button */}
          <button
            onClick={() => handleButtonAction("like")}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "2px solid rgba(34,197,94,0.2)",
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 2px 8px rgba(34,197,94,0.08)",
              color: "#22C55E",
            }}
            title="気になる (→)"
          >
            &#9829;
          </button>
        </div>
      )}

      {/* Undo + hints */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4 }}>
        {undoStack.length > 0 && (
          <button
            onClick={handleUndo}
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(30,30,60,0.4)",
              background: "rgba(99,102,241,0.04)",
              border: "1px solid rgba(99,102,241,0.08)",
              cursor: "pointer",
            }}
          >
            &#8617; 戻す
          </button>
        )}
        <span style={{ fontSize: 10, color: "rgba(30,30,60,0.25)" }}>
          ← 見送る / → 気になる / ↑ 保存
        </span>
      </div>
    </div>
  );
}
