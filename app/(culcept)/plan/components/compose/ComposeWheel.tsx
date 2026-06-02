"use client";

/**
 * ComposeWheel — 枠内で直接スクロールして選ぶインライン・ホイール 1 列（P4-3 改 2）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * CEO フィードバック反映:
 *   - **3段**（中央 + 上下 1 行）。
 *   - **中央の選択値をはっきり**（大きく・太字・濃色）＋中央枠を明確化。
 *   - 近傍も薄すぎない（slate-400）。空白(value=null) は間隔のみ（呼び出し側で制御）。
 */

import { useEffect, useRef } from "react";

export const WHEEL_ITEM_PX = 34;
const VISIBLE_ROWS = 3; // 中央 + 上下 1 行

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
      {/* 中央選択枠（はっきり） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-lg border-2 border-indigo-400 bg-indigo-50"
        style={{ height: WHEEL_ITEM_PX }}
      />
      <div
        ref={ref}
        data-testid={testid}
        role="listbox"
        aria-label={ariaLabel}
        onScroll={handleScroll}
        className="relative h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: WHEEL_ITEM_PX }} />
        {options.map((o) => {
          const active = o.value === value;
          return (
            <div
              key={String(o.value)}
              data-testid={testid ? `${testid}-opt-${o.value}` : undefined}
              role="option"
              aria-selected={active}
              className={
                "flex snap-center items-center justify-center tabular-nums " +
                (active
                  ? "text-lg font-bold text-slate-900"
                  : "text-sm text-slate-400")
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
