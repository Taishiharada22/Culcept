/**
 * HomePaneIndicator — Home 横スワイプの pane 切替 indicator
 *
 * 役割:
 *   - 現在の pane index を visual に示す dot indicator
 *   - tap / click で任意 pane に直接 jump (a11y / desktop fallback)
 *
 * 設計書: docs/alter-plan-home-integration-mini-design.md §4.3 (B3)
 *
 * CEO 補正 (2026-05-19) で必須化:
 *   - a11y (button role / aria-label / aria-current)
 *   - swipe できない環境でも button click で切替可能
 */

"use client";

import { memo } from "react";

interface HomePaneIndicatorProps {
  /** pane の総数 */
  count: number;
  /** 現在 active な pane の index (0-based) */
  currentIndex: number;
  /** dot click で発火 */
  onSelect: (index: number) => void;
  /** 各 pane の aria-label 用ラベル (例: ["Home", "Plan"]) */
  labels: ReadonlyArray<string>;
}

function HomePaneIndicatorBase({ count, currentIndex, onSelect, labels }: HomePaneIndicatorProps) {
  return (
    <div
      role="tablist"
      aria-label="ホーム画面の切替"
      className="flex justify-center items-center gap-2 py-3 select-none"
      data-testid="home-pane-indicator"
    >
      {Array.from({ length: count }).map((_, i) => {
        const active = i === currentIndex;
        const label = labels[i] ?? `Pane ${i + 1}`;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            aria-label={`${label} に切替`}
            data-testid={`home-pane-dot-${i}`}
            onClick={() => onSelect(i)}
            className={
              active
                ? "w-8 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
                : "w-2 h-2 rounded-full bg-slate-300 hover:bg-slate-400 transition-all duration-200"
            }
          />
        );
      })}
    </div>
  );
}

const HomePaneIndicator = memo(HomePaneIndicatorBase);
HomePaneIndicator.displayName = "HomePaneIndicator";

export default HomePaneIndicator;
