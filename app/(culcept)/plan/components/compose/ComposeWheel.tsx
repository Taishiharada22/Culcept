"use client";

/**
 * ComposeWheel — 枠内で直接スクロールして選ぶインライン・ホイール 1 列（P4-3）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * CEO 指示: 時間設定は「SVG を押してからネイティブ picker」ではなく、**枠内で直接スクロール**。
 *   - CSS scroll-snap の縦リスト。中央 band が選択値。
 *   - 外部 value 変更 → scroll 位置を同期（プログラム的 scroll 中は onChange を抑制してループ防止）。
 *   - スクロール停止（debounce）で中央 index → onChange。
 *
 * SSR: 初期 markup（options + 中央 highlight）を描画。scroll/effect は client のみ。
 */

import { useEffect, useRef } from "react";

export const WHEEL_ITEM_PX = 28;
const VISIBLE_ROWS = 3; // 中央 + 上下 1 行

export interface WheelOption {
  value: number;
  label: string;
}

export interface ComposeWheelProps {
  options: WheelOption[];
  value: number;
  onChange: (value: number) => void;
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

  // 外部 value → scroll 位置を同期（プログラム的 scroll は onChange を出さない）。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = idx * WHEEL_ITEM_PX;
    if (Math.abs(el.scrollTop - target) > 1) {
      programmatic.current = true;
      el.scrollTop = target;
      const t = setTimeout(() => {
        programmatic.current = false;
      }, 80);
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
      const v = options[clamped]?.value;
      if (v != null && v !== value) onChange(v);
    }, 110);
  };

  return (
    <div
      className="relative w-full"
      style={{ height: VISIBLE_ROWS * WHEEL_ITEM_PX }}
    >
      {/* 中央 band（選択域） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-md bg-indigo-50"
        style={{ height: WHEEL_ITEM_PX }}
      />
      <div
        ref={ref}
        data-testid={testid}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: WHEEL_ITEM_PX }} />
        {options.map((o) => {
          const active = o.value === value;
          return (
            <div
              key={o.value}
              data-testid={testid ? `${testid}-opt-${o.value}` : undefined}
              role="option"
              aria-selected={active}
              className={
                "flex snap-center items-center justify-center text-sm tabular-nums transition-colors " +
                (active ? "font-semibold text-indigo-700" : "text-slate-300")
              }
              style={{ height: WHEEL_ITEM_PX }}
            >
              {o.label}
            </div>
          );
        })}
        <div style={{ height: WHEEL_ITEM_PX }} />
      </div>
    </div>
  );
}
