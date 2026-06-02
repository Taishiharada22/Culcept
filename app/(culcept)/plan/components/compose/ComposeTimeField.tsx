"use client";

/**
 * ComposeTimeField — 時間 UI（⑤・開始 / 終了 / 間隔 を枠内スクロールで選ぶ・P4-3）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * CEO 指示:
 *   - 時間設定は **枠内スクロール**（SVG を押してネイティブ picker は廃止）。
 *   - 開始 / 終了 = 時(2桁) + 分(2桁) の縦ホイール。スクロールで選ぶ。
 *   - 開始・終了をスクロールすると **間隔 = 終了 − 開始** が自動反映（例: 34分なら 34分 表示）。
 *   - 間隔をスクロールすると **終了 = 開始 + 間隔** を自動設定。
 *   - 間隔は表向き 30分以降の 10分刻み。**長押しで 1分刻み**（例: 45–60 の間を長押し → 53分）。
 *   - 終了は開始より前にならない。22時以降の作成も可。
 *
 * 保存モデルは不変（mode/start/end）。表示専用ロジック。
 */

import { useRef, useState } from "react";

import type { ComposeTimeConstraint } from "@/lib/plan/compose/composeTimeResolver";

import { ComposeWheel, type WheelOption } from "./ComposeWheel";

const HOURS: WheelOption[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: String(h).padStart(2, "0"),
}));
const MINUTES: WheelOption[] = Array.from({ length: 60 }, (_, m) => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));

const DEFAULT_START = 9 * 60; // 09:00
const DEFAULT_END = 10 * 60; // 10:00
const MIN_DURATION = 10;

/** 間隔の選択肢。通常=30分以降の10分刻み(＋実値)、fine=1分刻み。 */
function intervalOptions(fine: boolean, current: number): WheelOption[] {
  if (fine) {
    return Array.from({ length: 236 }, (_, i) => {
      const v = 5 + i; // 5..240
      return { value: v, label: `${v}分` };
    });
  }
  const steps: number[] = [];
  for (let v = 30; v <= 240; v += 10) steps.push(v);
  if (current > 0 && !steps.includes(current)) steps.push(current); // 実値（10刻みでない）を挿入
  steps.sort((a, b) => a - b);
  return steps.map((v) => ({ value: v, label: `${v}分` }));
}

export interface ComposeTimeFieldProps {
  time: ComposeTimeConstraint;
  onTimeChange?: (time: ComposeTimeConstraint) => void;
}

export function ComposeTimeField({ time, onTimeChange }: ComposeTimeFieldProps) {
  const [fine, setFine] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startMin = time.startMin ?? DEFAULT_START;
  const endMin = time.endMin ?? DEFAULT_END;
  const duration = Math.max(MIN_DURATION, endMin - startMin);

  // 終了は開始より前にならないよう clamp（CEO 条件）。22時以降も可（上限 1439）。
  const commit = (s: number, e: number) => {
    const start = Math.max(0, Math.min(1439, s));
    const end = Math.max(start + MIN_DURATION, Math.min(1439, e));
    onTimeChange?.({ mode: "both", startMin: start, endMin: end });
  };

  const setStartHour = (h: number) => commit(h * 60 + (startMin % 60), endMin);
  const setStartMin = (m: number) =>
    commit(Math.floor(startMin / 60) * 60 + m, endMin);
  const setEndHour = (h: number) => commit(startMin, h * 60 + (endMin % 60));
  const setEndMin = (m: number) =>
    commit(startMin, Math.floor(endMin / 60) * 60 + m);
  const setInterval = (iv: number) => commit(startMin, startMin + iv);

  // 長押し → 1分刻み表示（CEO 指示）
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
        {/* 開始 */}
        <ColumnLabel label="開始">
          <div className="flex gap-0.5">
            <ComposeWheel
              testid="compose-time-start-hour"
              ariaLabel="開始（時）"
              options={HOURS}
              value={Math.floor(startMin / 60)}
              onChange={setStartHour}
            />
            <ComposeWheel
              testid="compose-time-start-min"
              ariaLabel="開始（分）"
              options={MINUTES}
              value={startMin % 60}
              onChange={setStartMin}
            />
          </div>
        </ColumnLabel>

        {/* 終了 */}
        <ColumnLabel label="終了">
          <div className="flex gap-0.5">
            <ComposeWheel
              testid="compose-time-end-hour"
              ariaLabel="終了（時）"
              options={HOURS}
              value={Math.floor(endMin / 60)}
              onChange={setEndHour}
            />
            <ComposeWheel
              testid="compose-time-end-min"
              ariaLabel="終了（分）"
              options={MINUTES}
              value={endMin % 60}
              onChange={setEndMin}
            />
          </div>
        </ColumnLabel>

        {/* 間隔（長押しで 1分刻み） */}
        <ColumnLabel label={fine ? "間隔(分)" : "間隔"}>
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
        </ColumnLabel>
      </div>
    </div>
  );
}

function ColumnLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-center text-[10px] text-slate-400">{label}</p>
      {children}
    </div>
  );
}
