"use client";

/**
 * RomanceSwipeClient — 恋愛枠専用スワイプUI
 * 写真上2/3、情報下1/3。アバター先行要素なし。
 * L2以上の身元確認が必要。
 *
 * Visual Identity: Passionate, photo-first, instant judgment, warm
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  type PanInfo,
} from "framer-motion";
import Link from "next/link";
import { RV_COLORS, RV_CATEGORY_COLORS } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import { hapticLight, hapticMedium, hapticHeavy } from "@/lib/rendezvous/haptics";
import {
  trackListView,
  trackCandidateOpen,
  trackRomanceSwipe,
} from "@/lib/rendezvous/trackRendezvous";

// =============================================================================
// Types
// =============================================================================

export type RomanceCandidate = {
  candidateId: string;
  photoUrl: string | null;
  displayName: string;
  age: number | null;
  area: string | null;
  corePhrase: string;
  resonanceLevel: 0 | 1 | 2 | 3;
  reasons: string[];
  caution: string | null;
};

type SwipeDirection = "right" | "left" | "up";

// =============================================================================
// Constants
// =============================================================================

const SWIPE_THRESHOLD_X = 100;
const SWIPE_THRESHOLD_Y = -100;
const ROMANCE_COLOR = RV_CATEGORY_COLORS.romantic;

// =============================================================================
// RomanceCard — 写真2/3 + 情報1/3
// =============================================================================

function RomanceCard({ candidate }: { candidate: RomanceCandidate }) {
  return (
    <div
      className="relative w-full h-full rounded-3xl overflow-hidden select-none"
      style={{
        background: RV_COLORS.surface,
        boxShadow: `0 12px 40px ${RV_COLORS.shadowDeep}, 0 0 20px ${ROMANCE_COLOR}08`,
        border: `1px solid ${RV_COLORS.border}`,
      }}
    >
      {/* ===== Photo Area — 上2/3 ===== */}
      <div className="relative w-full" style={{ height: "66.7%" }}>
        {candidate.photoUrl ? (
          <img
            src={candidate.photoUrl}
            alt={candidate.displayName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${ROMANCE_COLOR}15 0%, ${RV_COLORS.surfaceMuted} 100%)`,
            }}
          >
            <span className="text-8xl font-light" style={{ color: `${ROMANCE_COLOR}40` }}>
              {candidate.displayName.charAt(0)}
            </span>
          </div>
        )}

        {/* Bottom gradient — 写真→情報の滑らかな接続 */}
        <div
          className="absolute inset-x-0 bottom-0 h-24"
          style={{
            background: `linear-gradient(to top, ${RV_COLORS.surface} 0%, transparent 100%)`,
          }}
        />

        {/* Name + Age overlay on photo bottom */}
        <div className="absolute inset-x-0 bottom-2 px-5 z-10">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: RV_COLORS.text }}>
              {candidate.displayName}
            </span>
            {candidate.age && (
              <span className="text-lg font-medium" style={{ color: RV_COLORS.textSub }}>
                {candidate.age}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== Info Area — 下1/3 ===== */}
      <div className="px-5 py-4 flex flex-col gap-2.5" style={{ height: "33.3%" }}>
        {/* Core phrase */}
        <p
          className="text-sm font-medium leading-snug"
          style={{ color: ROMANCE_COLOR, fontFamily: '"Noto Serif JP", serif' }}
        >
          &ldquo;{candidate.corePhrase}&rdquo;
        </p>

        {/* Area */}
        {candidate.area && (
          <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>
            {candidate.area}
          </span>
        )}

        {/* Why shown — なぜ表示されたか */}
        <div
          className="flex items-center gap-1.5"
          style={{ marginTop: -2 }}
        >
          <div
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: `${ROMANCE_COLOR}60` }}
          />
          <span className="text-[11px]" style={{ color: RV_COLORS.textSub }}>
            {candidate.reasons[0] || `共鳴度: ${candidate.resonanceLevel * 33}%`}
          </span>
        </div>

        {/* Resonance dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: i < candidate.resonanceLevel ? 10 : 6,
                height: i < candidate.resonanceLevel ? 10 : 6,
                backgroundColor: i < candidate.resonanceLevel ? ROMANCE_COLOR : RV_COLORS.surfaceMuted,
                boxShadow: i < candidate.resonanceLevel ? `0 0 8px ${ROMANCE_COLOR}40` : "none",
              }}
            />
          ))}
          <span className="text-[11px] font-medium ml-1" style={{ color: ROMANCE_COLOR }}>
            共鳴
          </span>
        </div>

        {/* Reasons (max 2) */}
        {candidate.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.reasons.slice(0, 2).map((r, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: `${ROMANCE_COLOR}08`,
                  color: RV_COLORS.textSub,
                  border: `1px solid ${ROMANCE_COLOR}15`,
                }}
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SwipeOverlay — スワイプ方向に応じたフィードバック
// =============================================================================

function SwipeOverlay({ x, y }: { x: any; y: any }) {
  return (
    <>
      {/* Right = Like */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${ROMANCE_COLOR}25 0%, transparent 70%)`,
          opacity: useTransform(x, [0, 60, SWIPE_THRESHOLD_X], [0, 0, 1]),
        }}
      >
        <motion.div
          className="flex flex-col items-center gap-2"
          style={{
            opacity: useTransform(x, [0, 60, SWIPE_THRESHOLD_X], [0, 0, 1]),
            scale: useTransform(x, [60, SWIPE_THRESHOLD_X + 40], [0.5, 1]),
          }}
        >
          <span className="text-5xl">💗</span>
          <span className="text-sm font-bold tracking-wider" style={{ color: ROMANCE_COLOR }}>
            いいね
          </span>
        </motion.div>
      </motion.div>

      {/* Left = Skip */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          backgroundColor: "rgba(245,243,240,0.6)",
          opacity: useTransform(x, [0, -60, -SWIPE_THRESHOLD_X], [0, 0, 0.8]),
        }}
      >
        <motion.span
          className="text-lg font-medium tracking-wider"
          style={{
            color: RV_COLORS.textMuted,
            opacity: useTransform(x, [0, -60, -SWIPE_THRESHOLD_X], [0, 0, 1]),
          }}
        >
          スキップ
        </motion.span>
      </motion.div>

      {/* Up = Super Like */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${RV_COLORS.accent}20 0%, ${ROMANCE_COLOR}10 40%, transparent 70%)`,
          opacity: useTransform(y, [0, -60, SWIPE_THRESHOLD_Y], [0, 0, 1]),
        }}
      >
        <motion.div
          className="flex flex-col items-center gap-2"
          style={{
            opacity: useTransform(y, [0, -60, SWIPE_THRESHOLD_Y], [0, 0, 1]),
            scale: useTransform(y, [-60, SWIPE_THRESHOLD_Y - 40], [0.5, 1]),
          }}
        >
          <span className="text-5xl">⚡</span>
          <span className="text-sm font-bold tracking-wider" style={{ color: RV_COLORS.accent }}>
            超いいね
          </span>
        </motion.div>
      </motion.div>
    </>
  );
}

// =============================================================================
// DraggableRomanceCard
// =============================================================================

function DraggableRomanceCard({
  candidate,
  onSwipe,
}: {
  candidate: RomanceCandidate;
  onSwipe: (direction: SwipeDirection) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      const { offset, velocity } = info;
      if (offset.y < SWIPE_THRESHOLD_Y || velocity.y < -800) {
        onSwipe("up");
        return;
      }
      if (offset.x > SWIPE_THRESHOLD_X || velocity.x > 800) {
        onSwipe("right");
        return;
      }
      if (offset.x < -SWIPE_THRESHOLD_X || velocity.x < -800) {
        onSwipe("left");
        return;
      }
    },
    [onSwipe],
  );

  return (
    <motion.div
      className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
      style={{ x, y, rotate, zIndex: 10 }}
      drag
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      dragElastic={1}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      whileDrag={{ scale: 1.02 }}
    >
      <RomanceCard candidate={candidate} />
      <SwipeOverlay x={x} y={y} />
    </motion.div>
  );
}

// =============================================================================
// ActionButton — 下部アクションバーのボタン
// =============================================================================

function ActionButton({
  icon,
  label,
  color,
  size = 56,
  onClick,
}: {
  icon: string;
  label: string;
  color: string;
  size?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.08, y: -2 }}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 border-none cursor-pointer bg-transparent"
      aria-label={label}
    >
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: size,
          height: size,
          background: RV_COLORS.surface,
          border: `2px solid ${color}25`,
          boxShadow: `0 4px 20px ${color}18, 0 2px 8px ${RV_COLORS.shadow}`,
        }}
      >
        <span style={{ fontSize: size * 0.42 }}>{icon}</span>
      </div>
      <span
        className="text-[10px] font-semibold tracking-wide"
        style={{ color }}
      >
        {label}
      </span>
    </motion.button>
  );
}

// =============================================================================
// RomanceSwipeClient — メインコンポーネント
// =============================================================================

const CARD_OFFSETS = [
  { y: 0, scale: 1, opacity: 1 },
  { y: 10, scale: 0.95, opacity: 0.7 },
  { y: 20, scale: 0.90, opacity: 0.4 },
];

export default function RomanceSwipeClient() {
  const [candidates, setCandidates] = useState<RomanceCandidate[]>([]);
  const [stack, setStack] = useState<RomanceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyCount, setDailyCount] = useState(0);

  // Fetch romance-only candidates
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rendezvous/explore?category=romantic&limit=10");
      if (!res.ok) throw new Error("候補の取得に失敗しました");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "エラーが発生しました");

      const mapped: RomanceCandidate[] = (json.candidates ?? []).map((c: any) => ({
        candidateId: c.candidateId,
        photoUrl: c.photoUrl,
        displayName: c.displayName,
        age: c.age,
        area: c.area,
        corePhrase: c.corePhrase,
        resonanceLevel: Math.min(3, Math.max(0, c.resonanceLevel ?? 0)) as 0 | 1 | 2 | 3,
        reasons: c.reasons ?? [],
        caution: c.caution ?? null,
      }));

      setCandidates(mapped);
      setStack(mapped);
      setDailyCount(json.dailySwipeCount ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    trackListView("romance");
    fetchCandidates();
  }, [fetchCandidates]);

  const handleSwipe = useCallback(
    async (direction: SwipeDirection) => {
      if (stack.length === 0) return;
      const top = stack[0];
      setStack((prev) => prev.slice(1));
      setDailyCount((c) => c + 1);

      trackRomanceSwipe(direction, top.candidateId);

      if (direction === "right") hapticMedium();
      else if (direction === "left") hapticLight();
      else hapticHeavy();

      try {
        await fetch("/api/rendezvous/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: top.candidateId, direction }),
        });
      } catch {
        // fire-and-forget
      }
    },
    [stack],
  );

  const visible = stack.slice(0, 3);

  return (
    <div
      className="min-h-screen pb-20 relative"
      style={{
        background: `linear-gradient(180deg, ${RV_COLORS.base} 0%, rgba(233,30,99,0.03) 40%, rgba(255,109,0,0.02) 100%)`,
      }}
    >
      {/* ===== Premium Header ===== */}
      <FadeInView delay={0}>
        <div className="px-6 pt-5 pb-1">
          {/* Back + Title row */}
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/rendezvous"
              className="text-sm no-underline"
              style={{ color: RV_COLORS.textMuted }}
            >
              ←
            </Link>
            <span
              className="text-[11px] font-bold tracking-[0.2em] uppercase"
              style={{ color: ROMANCE_COLOR }}
            >
              恋愛
            </span>
          </div>

          {/* Tagline */}
          <p
            className="text-[15px] leading-relaxed mb-3"
            style={{
              color: RV_COLORS.textSub,
              fontFamily: '"Noto Serif JP", serif',
              letterSpacing: "0.02em",
            }}
          >
            直感が、最初の一歩を踏み出す
          </p>

          {/* Daily count */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>
              今日の出会い: {dailyCount} / 10
            </span>
            <span
              className="text-xs px-3 py-1.5 rounded-full font-medium"
              style={{
                backgroundColor: `${ROMANCE_COLOR}08`,
                border: `1px solid ${ROMANCE_COLOR}15`,
                color: ROMANCE_COLOR,
              }}
            >
              {dailyCount} / 10
            </span>
          </div>
        </div>
      </FadeInView>

      {/* ===== Card Stack ===== */}
      <div className="flex items-center justify-center px-6 mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[520px] gap-5">
            <motion.div
              className="w-14 h-14 rounded-full"
              style={{ border: `2px solid ${RV_COLORS.border}`, borderTopColor: ROMANCE_COLOR }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
              候補を探しています...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[520px] gap-4">
            <p className="text-sm" style={{ color: ROMANCE_COLOR }}>{error}</p>
            <button
              onClick={fetchCandidates}
              className="px-4 py-2 rounded-xl text-sm font-medium border-none cursor-pointer"
              style={{ background: `${ROMANCE_COLOR}10`, color: ROMANCE_COLOR }}
            >
              再試行
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[520px] gap-5">
            <motion.div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: `${ROMANCE_COLOR}10` }}
              animate={{ scale: [1, 1.12, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-3xl">💕</span>
            </motion.div>
            <p
              className="text-sm font-medium"
              style={{ color: RV_COLORS.textSub, fontFamily: '"Noto Serif JP", serif' }}
            >
              新しい候補を探しています...
            </p>
            <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
              また後でチェックしてみてください
            </p>
          </div>
        ) : (
          <div className="relative w-full mx-auto" style={{ maxWidth: 360, height: 520 }}>
            {visible.slice().reverse().map((c, reverseIdx) => {
              const idx = visible.length - 1 - reverseIdx;
              const offset = CARD_OFFSETS[idx] ?? CARD_OFFSETS[2];

              if (idx === 0) {
                return (
                  <AnimatePresence key={c.candidateId}>
                    <DraggableRomanceCard candidate={c} onSwipe={handleSwipe} />
                  </AnimatePresence>
                );
              }

              return (
                <motion.div
                  key={c.candidateId}
                  className="absolute inset-0 pointer-events-none"
                  animate={{ y: offset.y, scale: offset.scale, opacity: offset.opacity }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <RomanceCard candidate={c} />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Bottom Action Bar ===== */}
      {!loading && !error && visible.length > 0 && (
        <FadeInView delay={0.2}>
          <div className="flex items-end justify-center gap-6 mt-6 px-6">
            <ActionButton
              icon="✕"
              label="スキップ"
              color={RV_COLORS.textMuted}
              size={52}
              onClick={() => handleSwipe("left")}
            />
            <ActionButton
              icon="♥"
              label="いいね"
              color={ROMANCE_COLOR}
              size={64}
              onClick={() => handleSwipe("right")}
            />
            <ActionButton
              icon="⚡"
              label="超いいね"
              color={RV_COLORS.accent}
              size={52}
              onClick={() => handleSwipe("up")}
            />
          </div>
        </FadeInView>
      )}
    </div>
  );
}
