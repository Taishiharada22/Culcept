"use client";

/**
 * LocationHistoryChips — 「どこで？」の上に出す場所履歴チップ（④ Phase 1a・表示のみ）。
 *
 * 思想:
 *   - 自動確定しない。チップは候補提示のみ、**1 タップで選択**したときだけ確定（onPick）。
 *   - 履歴 0 件なら何も描画しない（fail-open）→ UI は外部検索だけに戻る。
 *
 * 範囲外: 集計（locationHistory.ts）/ 入力中の prefix サジェスト（Phase 2）。
 */

import type {
  LocationChip,
  LocationHistory,
} from "@/lib/plan/compose/locationHistory";

export interface LocationHistoryChipsProps {
  history: LocationHistory;
  onPick: (chip: LocationChip) => void;
}

export function LocationHistoryChips({
  history,
  onPick,
}: LocationHistoryChipsProps) {
  const { frequent, recent } = history;
  // 履歴なし → 何も出さない（fail-open）。
  if (frequent.length === 0 && recent.length === 0) return null;

  return (
    <div data-testid="compose-location-history" className="space-y-1 pt-1">
      {frequent.length > 0 && (
        <ChipRow group="frequent" label="よく行く" chips={frequent} onPick={onPick} />
      )}
      {recent.length > 0 && (
        <ChipRow group="recent" label="最近" chips={recent} onPick={onPick} />
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
  group: "frequent" | "recent";
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
