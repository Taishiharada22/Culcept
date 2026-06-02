"use client";

/**
 * ComposeWheel — 枠内で直接スクロールして選ぶインライン・ホイール 1 列（P4-3 改）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * 改善（CEO「20点」フィードバック反映）:
 *   - 中央に明確な**選択枠**（border + 背景）。選択値は**太字**、近傍は薄く。
 *   - 行高を上げ可読性UP（iOS ピッカー風）。
 *   - **空白(value=null)対応**：先頭に "—" を置き、未設定からスクロールで開始。
 */

import { useEffect, useRef } from "react";

export const WHEEL_ITEM_PX = 32;
const VISIBLE_ROWS = 5; // 中央 + 上下 2 行

export interface WheelOption {
  value: number | null;
  label: string;
}

export interface ComposeWheelProps {
  options: WheelOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  testid?: string;
  ariaLabel?: string;
}

export function ComposeWheel({
  options,
  value,
  onChange,
  testid,
  ariaLabel,
}: ComposeWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * WHEEL_ITEM_PX;
    if (Math.abs(el.scrollTop - target) > 1) {
      programmatic.current = true;
      el.scrollTop = target;
      const t = setTimeout(() => {
        programmatic.current = false;
      }, 90);
      return () => clearTimeout(t);
    }
  }, [idx]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || programmatic.current) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const i = Math.round(el.scrollTop / WHEEL_ITEM_PX);
      const clamped = Math.max(0, Math.min(options.length - 1, i));
      const o = options[clamped];
      if (o && o.value !== value) onChange(o.value);
    }, 110);
  };

  return (
    <div
      className="relative w-full"
      style={{ height: VISIBLE_ROWS * WHEEL_ITEM_PX }}
    >
      {/* 中央選択枠 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg border border-indigo-200 bg-indigo-50/70"
        style={{ height: WHEEL_ITEM_PX }}
      />
      {/* 上下フェード */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/3 bg-gradient-to-b from-white to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-white to-transparent"
      />
      <div
        ref={ref}
        data-testid={testid}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: WHEEL_ITEM_PX * 2 }} />
        {options.map((o) => {
          const active = o.value === value;
          return (
            <div
              key={String(o.value)}
              data-testid={testid ? `${testid}-opt-${o.value}` : undefined}
              role="option"
              aria-selected={active}
              className={
                "flex snap-center items-center justify-center tabular-nums transition-all " +
                (active
                  ? "text-base font-bold text-indigo-700"
                  : "text-xs text-slate-300")
              }
              style={{ height: WHEEL_ITEM_PX }}
            >
              {o.label}
            </div>
          );
        })}
        <div style={{ height: WHEEL_ITEM_PX * 2 }} />
      </div>
    </div>
  );
}
