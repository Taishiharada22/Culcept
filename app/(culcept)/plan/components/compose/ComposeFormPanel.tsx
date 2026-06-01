"use client";

/**
 * ComposeFormPanel — 右の「質問形式」予定作成パネル（A-2・controlled / presentational）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.5 / §4.3
 *
 * 責務（A-2）:
 *   - 質問形式 UI: なにをする？ / どこで？ / 時間は？ / 動かせなさ
 *   - 場所欄の下に「候補表示領域の枠」だけを置く（A-0 補正: PlaceCandidatesPanel の
 *     本格検索接続は A-3 以降。A-2 は見た目の枠のみ）
 *   - props 経由の controlled。状態保持は A-3 の container（useReducer）が持つ
 *
 * 範囲外（A-2）: PlaceCandidatesPanel 接続 / bias context / 検索 API / 保存 / ドラッグ。
 */

import { RIGIDITY_OPTIONS } from "@/lib/plan/anchor-input-form";
import { formatMinutes, parseMinutes } from "@/lib/plan/timeline-geometry";
import type { ComposeDraftCore } from "@/lib/plan/compose/composeDraft";
import type {
  ComposeTimeConstraint,
  TimeConstraintMode,
} from "@/lib/plan/compose/composeTimeResolver";

export interface ComposeFormPanelProps {
  core: ComposeDraftCore;
  time: ComposeTimeConstraint;
  onCoreChange?: (patch: Partial<ComposeDraftCore>) => void;
  onTimeChange?: (time: ComposeTimeConstraint) => void;
}

const MODE_OPTIONS: ReadonlyArray<{ value: TimeConstraintMode; label: string }> = [
  { value: "none", label: "未定" },
  { value: "start", label: "開始だけ" },
  { value: "end", label: "終了だけ" },
  { value: "both", label: "開始と終了" },
];

/** mode 切替時に不要な時刻を落とす（保持すべき軸のみ残す）。 */
function switchMode(
  prev: ComposeTimeConstraint,
  mode: TimeConstraintMode,
): ComposeTimeConstraint {
  return {
    mode,
    startMin: mode === "start" || mode === "both" ? prev.startMin : undefined,
    endMin: mode === "end" || mode === "both" ? prev.endMin : undefined,
  };
}

export function ComposeFormPanel({
  core,
  time,
  onCoreChange,
  onTimeChange,
}: ComposeFormPanelProps) {
  const showStart = time.mode === "start" || time.mode === "both";
  const showEnd = time.mode === "end" || time.mode === "both";

  return (
    <div data-testid="compose-form-panel" className="space-y-3">
      {/* なにをする？ */}
      <Question label="なにをする？">
        <input
          type="text"
          data-testid="compose-field-title"
          value={core.title}
          onChange={(e) => onCoreChange?.({ title: e.target.value })}
          placeholder="クライアントミーティング / 企画書 等"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus-visible:border-slate-300"
        />
      </Question>

      {/* どこで？（「カフェ」だけでも可。候補は枠のみ・A-2） */}
      <Question label="どこで？">
        <input
          type="text"
          data-testid="compose-field-location"
          value={core.locationText}
          onChange={(e) => onCoreChange?.({ locationText: e.target.value })}
          placeholder="例: 渋谷オフィス 会議室B / カフェ"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus-visible:border-slate-300"
        />
        {/* A-0 補正: 候補表示領域の「枠」のみ。実検索接続は A-3 以降。 */}
        <div
          data-testid="compose-location-candidates-placeholder"
          className="mt-1 rounded-md border border-dashed border-slate-200/70 px-2.5 py-1 text-[10px] text-slate-300"
        >
          場所の候補はここに表示されます
        </div>
      </Question>

      {/* 時間は？（最小入力。空＝未定） */}
      <Question label="時間は？">
        <div className="flex flex-wrap gap-1" data-testid="compose-field-time-mode">
          {MODE_OPTIONS.map((o) => {
            const active = time.mode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                data-testid={`compose-time-mode-${o.value}`}
                aria-pressed={active}
                onClick={() => onTimeChange?.(switchMode(time, o.value))}
                className={
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition " +
                  (active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                }
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {(showStart || showEnd) && (
          <div className="mt-2 flex gap-2">
            {showStart && (
              <label className="flex-1 space-y-1">
                <span className="text-[10px] text-slate-400">開始</span>
                <input
                  type="time"
                  data-testid="compose-field-start"
                  value={time.startMin != null ? formatMinutes(time.startMin) : ""}
                  onChange={(e) =>
                    onTimeChange?.({
                      ...time,
                      startMin: parseMinutes(e.target.value) ?? undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus-visible:border-slate-300"
                />
              </label>
            )}
            {showEnd && (
              <label className="flex-1 space-y-1">
                <span className="text-[10px] text-slate-400">終了</span>
                <input
                  type="time"
                  data-testid="compose-field-end"
                  value={time.endMin != null ? formatMinutes(time.endMin) : ""}
                  onChange={(e) =>
                    onTimeChange?.({
                      ...time,
                      endMin: parseMinutes(e.target.value) ?? undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus-visible:border-slate-300"
                />
              </label>
            )}
          </div>
        )}
        {time.mode === "both" &&
          time.startMin != null &&
          time.endMin != null &&
          time.endMin > time.startMin && (
            <p
              data-testid="compose-field-duration"
              className="mt-1.5 text-[11px] text-slate-400"
            >
              所要 {formatDurationLabel(time.endMin - time.startMin)}
            </p>
          )}
      </Question>

      {/* 動かせなさ（控えめ・インラインチップ。hint は tooltip へ退避） */}
      <Question label="動かせなさ">
        <div className="flex gap-1.5" data-testid="compose-field-rigidity">
          {RIGIDITY_OPTIONS.map((opt) => {
            const active = core.rigidity === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`compose-rigidity-${opt.value}`}
                aria-pressed={active}
                title={opt.hint}
                onClick={() => onCoreChange?.({ rigidity: opt.value })}
                className={
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition " +
                  (active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Question>
    </div>
  );
}

/** 所要時間（分）→ 表示ラベル（読み取り専用・開始＋終了から自動算出）。 */
function formatDurationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function Question({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {children}
    </div>
  );
}
