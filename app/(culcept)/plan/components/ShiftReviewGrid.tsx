"use client";

/**
 * Source-of-truth cell review（シフト取り込み確認画面 prototype）
 *
 * 設計書: docs/alter-plan-shift-import-cell-review-readiness.md
 *
 * fixture-based prototype（GPT 承認範囲）:
 *   - grid review（原稿表と同形で並べ、blank-skip が一目で浮く）
 *   - rawCode 修正 → 辞書/projection 即時再計算 → 反映予定ライブ更新
 *   - blank-risk / low-confidence の heuristic 強調（完全自動検出は保証しない）
 *   - projection preview（work→timed / off→day_indicator / unresolved→止める）
 *   - 保存ボタンは disabled（DB write / migration は次段 CEO gate）
 *
 * 不変原則: DB write なし。raw 画像非依存（fixture）。projectShiftRoster は pure 再利用。
 */

import { useMemo, useState } from "react";
import {
  type ShiftCodeDictionary,
  lookupCode,
  normalizeRawCode,
} from "@/lib/plan/shift/shiftCodeDictionary";
import {
  projectShiftRoster,
  type ShiftCellReading,
} from "@/lib/plan/shift/shiftRosterProjection";

/** 確認画面に渡す 1 セル（抽出結果 + 信頼度） */
export interface ShiftReviewCell {
  day: number;
  date: string; // YYYY-MM-DD
  rawCode: string; // "" = 空欄
  confidence: number; // 0..1
}

interface ShiftReviewGridProps {
  cells: ShiftReviewCell[];
  dictionary: ShiftCodeDictionary;
  monthLabel: string; // 例 "2025年7月"
  lowConfidenceThreshold?: number;
}

type CellKind = "empty" | "work" | "off" | "candidate" | "unresolved";

function cellKind(rawCode: string, dictionary: ShiftCodeDictionary): {
  kind: CellKind;
  meaning: string;
} {
  if (normalizeRawCode(rawCode) === "") return { kind: "empty", meaning: "空欄" };
  const entry = lookupCode(dictionary, rawCode);
  if (!entry) return { kind: "unresolved", meaning: "未知（要確認）" };
  switch (entry.projectMode) {
    case "timed_event":
      return { kind: "work", meaning: `${entry.displayLabel}（反映）` };
    case "day_indicator":
      return { kind: "off", meaning: `${entry.displayLabel}・休み表示` };
    case "candidate":
      return { kind: "candidate", meaning: `${entry.displayLabel}・候補` };
    default:
      return { kind: "unresolved", meaning: "要確認" };
  }
}

const KIND_STYLE: Record<CellKind, string> = {
  empty: "bg-gray-50 text-gray-400 border-gray-200",
  work: "bg-sky-50 text-sky-700 border-sky-300",
  off: "bg-slate-100 text-slate-600 border-slate-300",
  candidate: "bg-amber-50 text-amber-700 border-amber-300",
  unresolved: "bg-rose-50 text-rose-700 border-rose-300",
};

export function ShiftReviewGrid({
  cells: initialCells,
  dictionary,
  monthLabel,
  lowConfidenceThreshold = 0.7,
}: ShiftReviewGridProps) {
  const [cells, setCells] = useState<ShiftReviewCell[]>(initialCells);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // projection を即時再計算（Step1 の pure 関数を再利用）
  const projection = useMemo(() => {
    const readings: ShiftCellReading[] = cells.map((c) => ({
      date: c.date,
      rawCode: c.rawCode,
    }));
    return projectShiftRoster(readings, dictionary);
  }, [cells, dictionary]);

  // blank-risk heuristic: 低信頼 or 空欄に隣接（強調＝注意の補助。flag なし＝安全 ではない）
  const emptyDays = useMemo(
    () => new Set(cells.filter((c) => normalizeRawCode(c.rawCode) === "").map((c) => c.day)),
    [cells]
  );
  const isBlankRisk = (c: ShiftReviewCell): boolean =>
    c.confidence < lowConfidenceThreshold ||
    emptyDays.has(c.day - 1) ||
    emptyDays.has(c.day + 1);

  const knownCodes = Object.values(dictionary.codes).map((e) => e.rawCode);

  function setRawCode(day: number, rawCode: string) {
    setCells((prev) =>
      prev.map((c) => (c.day === day ? { ...c, rawCode, confidence: 1 } : c))
    );
    setSelectedDay(null);
  }

  return (
    <div data-testid="shift-review-grid" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{monthLabel} の取り込み確認</h2>
        <span className="text-xs text-gray-500">原稿と見比べて修正してください</span>
      </div>

      {/* honest banner（GPT 補正: 強調は補助、全格子レビューが最終保証） */}
      <p
        data-testid="shift-review-notice"
        className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        ⚠️ 強調（点線）は注意の補助です。<b>強調が無くても全セルを原稿と照合</b>してください。空欄が勝手に埋まる場合があります。
      </p>

      {/* grid review（原稿表と同形・横スクロール） */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 pb-1">
          {cells.map((c) => {
            const { kind } = cellKind(c.rawCode, dictionary);
            const risk = isBlankRisk(c);
            const selected = selectedDay === c.day;
            return (
              <button
                key={c.day}
                type="button"
                data-testid={`shift-review-cell-${c.day}`}
                data-kind={kind}
                data-blank-risk={risk ? "true" : "false"}
                onClick={() => setSelectedDay(selected ? null : c.day)}
                className={`flex w-12 shrink-0 flex-col items-center rounded border px-1 py-1 text-center ${KIND_STYLE[kind]} ${
                  risk ? "border-dashed ring-1 ring-amber-400" : ""
                } ${selected ? "ring-2 ring-sky-500" : ""}`}
              >
                <span className="text-[10px] text-gray-400">{c.day}</span>
                <span className="text-sm font-bold leading-tight">
                  {normalizeRawCode(c.rawCode) === "" ? "空" : c.rawCode}
                </span>
                {risk && <span className="text-[9px] text-amber-600">要確認</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* セル修正エディタ */}
      {selectedDay !== null && (
        <div data-testid="shift-review-editor" className="rounded-md border border-gray-200 p-2">
          <p className="mb-1 text-xs text-gray-600">{selectedDay}日のコードを修正</p>
          <div className="flex flex-wrap gap-1">
            {knownCodes.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setRawCode(selectedDay, code)}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
              >
                {code}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRawCode(selectedDay, "")}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
            >
              空欄
            </button>
          </div>
          {(() => {
            const cell = cells.find((c) => c.day === selectedDay)!;
            const { meaning } = cellKind(cell.rawCode, dictionary);
            return <p className="mt-1 text-[11px] text-gray-500">現在の意味: {meaning}</p>;
          })()}
        </div>
      )}

      {/* projection preview（反映イメージ） */}
      <div data-testid="shift-review-preview" className="rounded-md bg-gray-50 p-2 text-xs">
        <p className="mb-1 font-medium text-gray-700">反映プレビュー</p>
        <div className="flex flex-wrap gap-3">
          <span>勤務（予定化）: <b>{projection.timedEvents.length}</b></span>
          <span>休み（表示のみ）: <b>{projection.dayIndicators.length}</b></span>
          <span>候補: <b>{projection.candidates.length}</b></span>
          <span className={projection.unresolved.length ? "text-rose-600" : ""}>
            要確認: <b>{projection.unresolved.length}</b>
          </span>
        </div>
      </div>

      {/* 保存（prototype は disabled） */}
      <button
        type="button"
        data-testid="shift-review-save"
        disabled
        className="cursor-not-allowed rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-500"
        title="保存は次段（DB 承認後）"
      >
        反映する（保存は次段で有効化）
      </button>
    </div>
  );
}
