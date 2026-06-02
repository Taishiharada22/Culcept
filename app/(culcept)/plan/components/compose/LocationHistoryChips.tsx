"use client";

/**
 * LocationHistoryChips — 「どこで？」の上に出す場所履歴チップ（④ Phase 1a 改・表示のみ）。
 *
 * - 「よく行く」= 頻度上位（常時）。
 * - 「この予定」= title 連動（予定内容に合った過去の場所・title 非空時のみ）。
 * - 自動確定しない。1 タップ onPick で確定。両方空なら描画なし（fail-open）。
 */

import type { LocationChip } from "@/lib/plan/compose/locationHistory";

export interface LocationHistoryChipsProps {
  frequent: LocationChip[];
  forTitle: LocationChip[];
  /** 「この予定」グループの見出し（例: 「勉強」の場所）。未指定は汎用文言。 */
  forTitleLabel?: string;
  onPick: (chip: LocationChip) => void;
}

export function LocationHistoryChips({
  frequent,
  forTitle,
  forTitleLabel,
  onPick,
}: LocationHistoryChipsProps) {
  if (frequent.length === 0 && forTitle.length === 0) return null;

  return (
    <div data-testid="compose-location-history" className="space-y-1 pt-1">
      {frequent.length > 0 && (
        <ChipRow group="frequent" label="よく行く" chips={frequent} onPick={onPick} />
      )}
      {forTitle.length > 0 && (
        <ChipRow
          group="for-title"
          label={forTitleLabel ?? "この予定でよく行く"}
          chips={forTitle}
          onPick={onPick}
        />
      )}
    </div>
  );
}

function ChipRow({
  group,
  label,
  chips,
  onPick,
}: {
  group: "frequent" | "for-title";
  label: string;
  chips: LocationChip[];
  onPick: (chip: LocationChip) => void;
}) {
  return (
    <div
      data-testid={`compose-loc-${group}`}
      className="flex flex-wrap items-center gap-1"
    >
      <span className="shrink-0 text-[10px] font-medium text-slate-400">
        {label}
      </span>
      {chips.map((c) => (
        <button
          key={c.text}
          type="button"
          data-testid="compose-loc-chip"
          data-group={group}
          onClick={() => onPick(c)}
          title={c.text}
          className="max-w-[150px] truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95"
        >
          {c.text}
        </button>
      ))}
    </div>
  );
}
