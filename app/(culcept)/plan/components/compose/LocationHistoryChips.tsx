"use client";

/**
 * LocationHistoryChips — 「どこで？」の上の場所履歴チップ（④ Phase 1a・表示のみ）。
 *
 * - 「よく行く」= 頻度上位（常時）。「この予定」= title 連動（title 非空時のみ）。
 * - **短タップ = 選択**（locationText に反映）。**長押し = 軽い詳細**（案A・既存データのみ）。
 *   長押しは選択を発火しない（タップ選択を邪魔しない）。自動確定なし。
 * - 両方空なら描画なし（fail-open）。外部 API / DB / log 出力は一切しない。
 */

import { useRef, useState } from "react";

import type { LocationChip } from "@/lib/plan/compose/locationHistory";
import type { LocationCategory } from "@/lib/plan/location-category";

export interface LocationHistoryChipsProps {
  frequent: LocationChip[];
  forTitle: LocationChip[];
  forTitleLabel?: string;
  onPick: (chip: LocationChip) => void;
}

const CATEGORY_LABEL: Record<LocationCategory, string> = {
  home: "自宅",
  office: "職場",
  school: "学校",
  cafe: "カフェ",
  outdoor: "屋外",
  public: "公共",
  transit: "移動",
  unknown: "その他",
};

/** "YYYY-MM-DD" / ISO → "M/D"（表示専用）。 */
function shortDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return `${Number(m[2])}/${Number(m[3])}`;
}

export function LocationHistoryChips({
  frequent,
  forTitle,
  forTitleLabel,
  onPick,
}: LocationHistoryChipsProps) {
  const [detail, setDetail] = useState<LocationChip | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  if (frequent.length === 0 && forTitle.length === 0) return null;

  const startLong = (chip: LocationChip) => {
    longFiredRef.current = false;
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      setDetail(chip);
    }, 450);
  };
  const cancelLong = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const handleClick = (chip: LocationChip) => {
    if (longFiredRef.current) {
      // 長押しで詳細を出した直後の click は選択しない（タップ選択を邪魔しない）。
      longFiredRef.current = false;
      return;
    }
    onPick(chip);
  };

  const row = (
    group: "frequent" | "for-title",
    label: string,
    chips: LocationChip[],
  ) =>
    chips.length > 0 ? (
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
            onPointerDown={() => startLong(c)}
            onPointerUp={cancelLong}
            onPointerLeave={cancelLong}
            onPointerCancel={cancelLong}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => handleClick(c)}
            title={c.text}
            className="max-w-[150px] touch-none truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95"
          >
            {c.text}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div data-testid="compose-location-history" className="space-y-1 pt-1">
      {row("frequent", "よく行く", frequent)}
      {row("for-title", forTitleLabel ?? "この予定でよく行く", forTitle)}

      {/* 長押し詳細（案A・既存データのみ・情報のみ） */}
      {detail && (
        <div
          data-testid="compose-loc-detail"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="truncate font-semibold text-slate-800">
              {detail.text}
            </span>
            <button
              type="button"
              data-testid="compose-loc-detail-close"
              aria-label="閉じる"
              onClick={() => setDetail(null)}
              className="shrink-0 rounded px-1 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <p className="mt-0.5 tabular-nums text-slate-500">
            {detail.category ? `${CATEGORY_LABEL[detail.category]} · ` : ""}
            {detail.count}回
            {shortDate(detail.usedAtISO) ? ` · 最終 ${shortDate(detail.usedAtISO)}` : ""}
          </p>
          {detail.sampleTitles && detail.sampleTitles.length > 0 && (
            <p className="mt-0.5 truncate text-slate-500">
              最近: {detail.sampleTitles.join("、")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
