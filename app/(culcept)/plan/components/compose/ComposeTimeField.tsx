"use client";

/**
 * ComposeTimeField — 時間 UI（⑤・開始 / 終了 / 間隔 を枠内スクロールで選ぶ・P4-3 改）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * CEO フィードバック反映:
 *   - 全て **空白からスタート**（開始/終了/間隔とも未設定 = "—"）。
 *   - 間隔は **30 の上に空白("—")**。そこからスクロールで 30,40,... を選ぶ（30以降10分刻み＋実値）。
 *   - 開始・終了 = 時(2桁) ":" 分(2桁) の縦ホイール。スクロールで選ぶ（時=1時間刻み・分=1分刻み）。
 *   - 開始/終了 → 間隔（=終了−開始）自動。間隔 → 終了（=開始+間隔）自動（開始未設定なら 09:00 起点）。
 *   - 間隔セル長押し → 1分刻み。終了<開始は防止、22時以降可。
 */

import { useRef, useState } from "react";

import type {
  ComposeTimeConstraint,
  TimeConstraintMode,
} from "@/lib/plan/compose/composeTimeResolver";

import { ComposeWheel, type WheelOption } from "./ComposeWheel";

const BLANK: WheelOption = { value: null, label: "—" };
const HOURS: WheelOption[] = [
  BLANK,
  ...Array.from({ length: 24 }, (_, h) => ({
    value: h,
    label: String(h).padStart(2, "0"),
  })),
];
const MINUTES: WheelOption[] = [
  BLANK,
  ...Array.from({ length: 60 }, (_, m) => ({
    value: m,
    label: String(m).padStart(2, "0"),
  })),
];

const DEFAULT_START = 9 * 60; // 間隔のみ先に選んだ時の起点
const MIN_DURATION = 5;

function deriveMode(s: number | null, e: number | null): TimeConstraintMode {
  if (s != null && e != null) return "both";
  if (s != null) return "start";
  if (e != null) return "end";
  return "none";
}

function intervalOptions(fine: boolean, current: number | null): WheelOption[] {
  if (fine) {
    return [
      BLANK,
      ...Array.from({ length: 236 }, (_, i) => {
        const v = 5 + i; // 5..240
        return { value: v, label: `${v}分` };
      }),
    ];
  }
  const steps: number[] = [];
  for (let v = 30; v <= 240; v += 10) steps.push(v);
  if (current != null && current > 0 && !steps.includes(current)) {
    steps.push(current); // 実値（10刻みでない）を挿入
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

  const startMin = time.startMin ?? null;
  const endMin = time.endMin ?? null;
  const startH = startMin != null ? Math.floor(startMin / 60) : null;
  const startM = startMin != null ? startMin % 60 : null;
  const endH = endMin != null ? Math.floor(endMin / 60) : null;
  const endM = endMin != null ? endMin % 60 : null;
  const duration =
    startMin != null && endMin != null && endMin > startMin
      ? endMin - startMin
      : null;

  const clampDay = (m: number) => Math.max(0, Math.min(1439, m));

  const commit = (s: number | null, e: number | null) => {
    let start = s != null ? clampDay(s) : null;
    let end = e != null ? clampDay(e) : null;
    if (start != null && end != null && end <= start) {
      end = clampDay(start + MIN_DURATION);
    }
    onTimeChange?.({
      mode: deriveMode(start, end),
      startMin: start ?? undefined,
      endMin: end ?? undefined,
    });
  };

  const setStartHour = (h: number | null) =>
    commit(h != null ? h * 60 + (startM ?? 0) : null, endMin);
  const setStartMin = (m: number | null) =>
    commit(m != null ? (startH ?? 9) * 60 + m : startH != null ? startH * 60 : null, endMin);
  const setEndHour = (h: number | null) =>
    commit(startMin, h != null ? h * 60 + (endM ?? 0) : null);
  const setEndMin = (m: number | null) =>
    commit(startMin, m != null ? (endH ?? 10) * 60 + m : endH != null ? endH * 60 : null);
  const setInterval = (iv: number | null) => {
    if (iv == null) {
      commit(startMin, null);
      return;
    }
    const base = startMin ?? DEFAULT_START;
    commit(base, base + iv);
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
        {/* 開始 */}
        <Column label="開始">
          <ComposeWheel
            testid="compose-time-start-hour"
            ariaLabel="開始（時）"
            options={HOURS}
            value={startH}
            onChange={setStartHour}
          />
          <Colon />
          <ComposeWheel
            testid="compose-time-start-min"
            ariaLabel="開始（分）"
            options={MINUTES}
            value={startM}
            onChange={setStartMin}
          />
        </Column>

        {/* 終了 */}
        <Column label="終了">
          <ComposeWheel
            testid="compose-time-end-hour"
            ariaLabel="終了（時）"
            options={HOURS}
            value={endH}
            onChange={setEndHour}
          />
          <Colon />
          <ComposeWheel
            testid="compose-time-end-min"
            ariaLabel="終了（分）"
            options={MINUTES}
            value={endM}
            onChange={setEndMin}
          />
        </Column>

        {/* 間隔（30 の上に空白。長押しで 1分刻み） */}
        <div className="space-y-0.5">
          <p className="text-center text-[10px] text-slate-400">
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
    <div className="space-y-0.5">
      <p className="text-center text-[10px] text-slate-400">{label}</p>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

function Colon() {
  return <span className="text-sm font-semibold text-slate-400">:</span>;
}
