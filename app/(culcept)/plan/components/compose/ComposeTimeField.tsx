"use client";

/**
 * ComposeTimeField — 時間 UI（⑤・開始 / 終了 / 間隔 を枠内スクロールで選ぶ・P4-3 改 2）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * CEO フィードバック反映:
 *   - **空白(—)は間隔のみ**。開始/終了は空白なし（既定 09:00 / 10:00）。
 *   - 開始/終了は **3段**（ComposeWheel 側で制御）。時 ":" 分。
 *   - 中央の選択値をはっきり（ComposeWheel 側）。
 *   - 間隔は「30 の上に空白(—)」→30,40,…（10分刻み＋実値）。長押しで1分刻み。
 *   - 開始/終了→間隔 自動、間隔→終了 自動。終了<開始は防止、22時以降可。
 */

import { useRef, useState } from "react";

import type {
  ComposeTimeConstraint,
  TimeConstraintMode,
} from "@/lib/plan/compose/composeTimeResolver";

import { ComposeWheel, type WheelOption } from "./ComposeWheel";

// 開始/終了は空白なし（既定値あり）
const HOURS: WheelOption[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: String(h).padStart(2, "0"),
}));
const MINUTES: WheelOption[] = Array.from({ length: 60 }, (_, m) => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));
const BLANK: WheelOption = { value: null, label: "—" };

const DEFAULT_START = 9 * 60; // 09:00
const DEFAULT_END = 10 * 60; // 10:00
const MIN_DURATION = 5;

function deriveMode(s: number | null, e: number | null): TimeConstraintMode {
  if (s != null && e != null) return "both";
  if (s != null) return "start";
  if (e != null) return "end";
  return "none";
}

/** 間隔: 先頭に空白(—)、その下に 30以降10分刻み(＋実値)。fine=1分刻み。 */
function intervalOptions(fine: boolean, current: number | null): WheelOption[] {
  if (fine) {
    return [
      BLANK,
      ...Array.from({ length: 236 }, (_, i) => {
        const v = 5 + i;
        return { value: v, label: `${v}分` };
      }),
    ];
  }
  const steps: number[] = [];
  for (let v = 30; v <= 240; v += 10) steps.push(v);
  if (current != null && current > 0 && !steps.includes(current)) {
    steps.push(current);
  }
  steps.sort((a, b) => a - b);
  return [BLANK, ...steps.map((v) => ({ value: v, label: `${v}分` }))];
}

export interface ComposeTimeFieldProps {
  time: ComposeTimeConstraint;
  onTimeChange?: (time: ComposeTimeConstraint) => void;
}

export function ComposeTimeField({ time, onTimeChange }: ComposeTimeFieldProps) {
  const [fine, setFine] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 既定: 開始 09:00 / 終了 10:00（空白なし）。
  const effStart = time.startMin ?? DEFAULT_START;
  const effEnd = time.endMin ?? DEFAULT_END;
  const sH = Math.floor(effStart / 60);
  const sM = effStart % 60;
  const eH = Math.floor(effEnd / 60);
  const eM = effEnd % 60;
  const duration = effEnd > effStart ? effEnd - effStart : null;

  const clampDay = (m: number) => Math.max(0, Math.min(1439, m));

  const commit = (s: number, e: number | null) => {
    const start = clampDay(s);
    let end = e != null ? clampDay(e) : null;
    if (end != null && end <= start) end = clampDay(start + MIN_DURATION);
    onTimeChange?.({
      mode: deriveMode(start, end),
      startMin: start,
      endMin: end ?? undefined,
    });
  };

  const setStartHour = (h: number | null) =>
    h != null && commit(h * 60 + sM, effEnd);
  const setStartMin = (m: number | null) =>
    m != null && commit(sH * 60 + m, effEnd);
  const setEndHour = (h: number | null) =>
    h != null && commit(effStart, h * 60 + eM);
  const setEndMin = (m: number | null) =>
    m != null && commit(effStart, eH * 60 + m);
  const setInterval = (iv: number | null) => {
    if (iv == null) return; // 間隔の空白は no-op（先頭の起点表示）
    commit(effStart, effStart + iv);
  };

  const startLongPress = () => {
    longPress.current = setTimeout(() => setFine(true), 450);
  };
  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  return (
    <div data-testid="compose-time-field" className="space-y-1">
      <p className="text-xs font-medium text-slate-600">時間</p>
      <div className="grid grid-cols-3 gap-2">
        <Column label="開始">
          <ComposeWheel
            testid="compose-time-start-hour"
            ariaLabel="開始（時）"
            options={HOURS}
            value={sH}
            onChange={setStartHour}
          />
          <Colon />
          <ComposeWheel
            testid="compose-time-start-min"
            ariaLabel="開始（分）"
            options={MINUTES}
            value={sM}
            onChange={setStartMin}
          />
        </Column>

        <Column label="終了">
          <ComposeWheel
            testid="compose-time-end-hour"
            ariaLabel="終了（時）"
            options={HOURS}
            value={eH}
            onChange={setEndHour}
          />
          <Colon />
          <ComposeWheel
            testid="compose-time-end-min"
            ariaLabel="終了（分）"
            options={MINUTES}
            value={eM}
            onChange={setEndMin}
          />
        </Column>

        {/* 間隔 = 所要（開始/終了 から導出）。indigo tint で時刻 2 列と区別。 */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-1 pb-1 pt-0.5">
          <p className="text-center text-[11px] font-semibold text-indigo-500">
            {fine ? "間隔(分)" : "間隔"}
          </p>
          <div
            data-testid="compose-time-interval"
            data-fine={fine ? "true" : "false"}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
          >
            <ComposeWheel
              testid="compose-time-interval-wheel"
              ariaLabel="間隔"
              options={intervalOptions(fine, duration)}
              value={duration}
              onChange={setInterval}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-1 pb-1 pt-0.5">
      <p className="text-center text-[11px] font-semibold text-slate-600">
        {label}
      </p>
      <div className="flex items-center justify-center gap-0.5">{children}</div>
    </div>
  );
}

function Colon() {
  return <span className="px-px text-base font-bold text-slate-400">:</span>;
}
