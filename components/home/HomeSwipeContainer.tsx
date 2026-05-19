/**
 * HomeSwipeContainer — Home 横スワイプ wrapper
 *
 * 役割:
 *   既存 AneurasyncHome (Pane 0) と HomePlanPane (Pane 1) を横スワイプで
 *   切り替える wrapper。CEO 補正 (2026-05-19) の必須補正 1-7 を機械的に実装。
 *
 * 設計書: docs/alter-plan-home-integration-mini-design.md §4
 *
 * CEO 補正反映:
 *   1. Home 既存体験を壊さない (AneurasyncHome は as-is、wrapper のみ)
 *   2. Gesture 競合対策 (dragDirectionLock + threshold + velocity + iOS edge back ignore)
 *   3. /plan 本体は触らない (PlanClient 不変、HomePlanPane は summary のみ)
 *   4. Feature flag は app/(culcept)/page.tsx で server-side eval
 *   5. Zone isolation (各 pane を <ZoneErrorBoundary> でラップ)
 *   6. a11y (dot indicator / keyboard 左右矢印 / aria-live announcement)
 *
 * Beyond (自立推論):
 *   - prefers-reduced-motion 対応 (spring → instant)
 *   - iOS Safari edge back gesture との衝突回避 (画面左端 20px 内の右 swipe を無視)
 *   - input / textarea / contenteditable フォーカス中は keyboard navigation 無効
 *   - 両 pane 常時 mount (display:none ではなく transform で off-screen)
 *     → Home の scroll position 保持、Plan の re-fetch 不要
 *   - dragMomentum=false で iOS momentum scroll との衝突回避
 */

"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  motion,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";

import ZoneErrorBoundary from "@/app/_home/ZoneErrorBoundary";
import {
  evaluateSwipeIntent,
  applySwipeAction,
} from "@/lib/plan/home-swipe-intent";

import HomePaneIndicator from "./HomePaneIndicator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** drag elasticity (over-drag の resistance) */
const DRAG_ELASTIC = 0.2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface HomeSwipeContainerProps {
  /** Pane 0: 既存 AneurasyncHome (構造不変) */
  homePane: ReactNode;
  /** Pane 1: HomePlanPane (summary view) */
  planPane: ReactNode;
  /** test 用、初期 pane index (default: 0) */
  initialIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function HomeSwipeContainer({
  homePane,
  planPane,
  initialIndex = 0,
}: HomeSwipeContainerProps) {
  const PANE_COUNT = 2;
  const PANE_IDS = ["home", "plan"] as const;
  const PANE_LABELS: ReadonlyArray<string> = ["Home", "Plan"];

  const clampedInitial = Math.max(0, Math.min(PANE_COUNT - 1, initialIndex));
  const [currentIndex, setCurrentIndex] = useState(clampedInitial);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // ── container width measurement (ResizeObserver) ──
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const measure = () => setContainerWidth(el.offsetWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── keyboard navigation (左右矢印キー) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // 入力中は keyboard nav を無効化 (composer / form 入力との衝突回避)
      if (
        target &&
        (target.matches?.("input, textarea, select") ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        setCurrentIndex((i) => Math.min(PANE_COUNT - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── swipe gesture handler (pure 判定は home-swipe-intent.ts) ──
  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const action = evaluateSwipeIntent({
        offsetX: info.offset.x,
        velocityX: info.velocity.x,
        containerWidth,
        dragStartX: info.point.x - info.offset.x,
      });
      setCurrentIndex((i) => applySwipeAction(i, PANE_COUNT, action));
    },
    [containerWidth]
  );

  // ── pane carrier transition ──
  const x = -currentIndex * containerWidth;
  const carrierTransition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 400, damping: 40, mass: 0.6 };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-[100dvh]"
      data-testid="home-swipe-container"
    >
      {/* ─── Carrier (swipe area) ─── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <motion.div
          className="flex h-full"
          style={{ width: `${PANE_COUNT * 100}%` }}
          animate={{ x }}
          transition={carrierTransition}
          drag={containerWidth > 0 ? "x" : false}
          dragDirectionLock
          dragConstraints={{
            left: -(PANE_COUNT - 1) * containerWidth,
            right: 0,
          }}
          dragElastic={DRAG_ELASTIC}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          data-testid="home-swipe-carrier"
        >
          {PANE_IDS.map((id, i) => {
            const element = i === 0 ? homePane : planPane;
            const inactive = i !== currentIndex;
            return (
              <div
                key={id}
                role="region"
                aria-label={PANE_LABELS[i]}
                aria-roledescription="swipeable pane"
                aria-hidden={inactive}
                tabIndex={inactive ? -1 : 0}
                className="flex-shrink-0 h-full overflow-hidden"
                style={{
                  width: `${100 / PANE_COUNT}%`,
                  // non-active pane は pointer events 無効 → 内部 click が誤発火しない
                  pointerEvents: inactive ? "none" : "auto",
                }}
                data-testid={`home-pane-${id}`}
              >
                <ZoneErrorBoundary zoneName={`home-pane-${id}`}>
                  {element}
                </ZoneErrorBoundary>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* aria-live for screen reader pane change announcement */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {PANE_LABELS[currentIndex] ?? ""} を表示中
      </div>

      {/* ─── Bottom indicator ─── */}
      <HomePaneIndicator
        count={PANE_COUNT}
        currentIndex={currentIndex}
        onSelect={setCurrentIndex}
        labels={PANE_LABELS}
      />
    </div>
  );
}
