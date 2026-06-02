"use client";

/**
 * ComposeTimeField — 時間 UI（⑤・理想画像の「開始 / 終了 / 間隔」3列）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * 旧「未定 / 開始だけ / 終了だけ / 開始と終了」モード選択は撤去（CEO 指示）。
 *   - 開始・終了: input[type=time]（モバイルは時/分のネイティブ・スクロール選択）。
 *     ※完全な常時ホイール表現は P4-3 で。range/drop/保存契約は不変。
 *   - 間隔: 30/45/60/90/120 のクイック選択（開始から終了を算出）。所要は自動表示。
 *   - mode は埋まった軸から導出（保存モデル不変: start/end は任意のまま）。
 *
 * ロジック: 終了は開始より前にならない（間隔指定時）。22時以降の作成は妨げない。
 */

import { formatMinutes, parseMinutes } from "@/lib/plan/timeline-geometry";
import type {
  ComposeTimeConstraint,
  TimeConstraintMode,
} from "@/lib/plan/compose/composeTimeResolver";

const INTERVALS = [30, 45, 60, 90, 120] as const;
const DEFAULT_START_MIN = 9 * 60; // 09:00（間隔のみ先に押した場合の起点）

function deriveMode(startMin?: number, endMin?: number): TimeConstraintMode {
  if (startMin != null && endMin != null) return "both";
  if (startMin != null) return "start";
  if (endMin != null) return "end";
  return "none";
}

export interface ComposeTimeFieldProps {
  time: ComposeTimeConstraint;
  onTimeChange?: (time: ComposeTimeConstraint) => void;
}

export function ComposeTimeField({ time, onTimeChange }: ComposeTimeFieldProps) {
  const setStart = (v: string) => {
    const startMin = parseMinutes(v) ?? undefined;
    onTimeChange?.({ ...time, mode: deriveMode(startMin, time.endMin), startMin });
  };
  const setEnd = (v: string) => {
    const endMin = parseMinutes(v) ?? undefined;
    onTimeChange?.({ ...time, mode: deriveMode(time.startMin, endMin), endMin });
  };
  const setInterval = (mins: number) => {
    const startMin = time.startMin ?? DEFAULT_START_MIN;
    const endMin = Math.min(startMin + mins, 1439); // 22時以降も可・1439 上限
    onTimeChange?.({ mode: "both", startMin, endMin });
  };

  const duration =
    time.startMin != null && time.endMin != null && time.endMin > time.startMin
      ? time.endMin - time.startMin
      : null;

  return (
    <div data-testid="compose-time-field" className="space-y-1">
      <p className="text-xs font-medium text-slate-600">時間</p>
      <div className="grid grid-cols-3 gap-2">
        <TimeColumn
          label="開始"
          testid="compose-time-start"
          value={time.startMin != null ? formatMinutes(time.startMin) : ""}
          onChange={setStart}
        />
        <TimeColumn
          label="終了"
          testid="compose-time-end"
          value={time.endMin != null ? formatMinutes(time.endMin) : ""}
          onChange={setEnd}
        />
        <div className="space-y-1">
          <p className="text-center text-[10px] text-slate-400">間隔</p>
          <div
            data-testid="compose-time-interval"
            className="flex max-h-[6.5rem] flex-col gap-1 overflow-y-auto pr-0.5"
          >
            {INTERVALS.map((m) => {
              const active = duration === m;
              return (
                <button
                  key={m}
                  type="button"
                  data-testid={`compose-interval-${m}`}
                  aria-pressed={active}
                  onClick={() => setInterval(m)}
                  className={
                    "rounded-md border px-2 py-1 text-xs tabular-nums transition " +
                    (active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                  }
                >
                  {m}分
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {duration != null && (
        <p
          data-testid="compose-time-duration"
          className="text-[11px] text-slate-400"
        >
          所要 {formatDurationLabel(duration)}
        </p>
      )}
    </div>
  );
}

function TimeColumn({
  label,
  testid,
  value,
  onChange,
}: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-center text-[10px] text-slate-400">{label}</p>
      <input
        type="time"
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm tabular-nums focus:outline-none focus-visible:border-slate-300"
      />
    </div>
  );
}

function formatDurationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}
