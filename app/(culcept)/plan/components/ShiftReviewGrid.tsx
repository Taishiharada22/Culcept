"use client";

/**
 * Source-of-truth cell review（シフト取り込み確認画面）
 *
 * 設計書: docs/alter-plan-shift-import-cell-review-readiness.md
 *
 * カレンダー型 grid review（CEO/GPT 2026-05-30）:
 *   - 月全体を 7列×週 のカレンダーで一覧（曜日ヘッダ付き）→ blank-skip が一目で浮く
 *   - セルタップ → bottom sheet 詳細（原稿セル crop 枠 / 意味 / 反映予定 / 修正 picker）
 *   - blank-risk は小さな corner marker（うるさくしない）+ 上部 honest banner
 *   - projection preview は下部 sticky / 保存ボタン disabled
 *   - glassmorphism で上質に
 *
 * 不変原則: 機能（編集→辞書/projection 即時再計算→preview→blank-risk）は不変。
 *           見せ方のみ進化。DB write なし・raw 画像非依存（fixture）。
 */

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import {
  type ShiftCodeDictionary,
  lookupCode,
  normalizeRawCode,
} from "@/lib/plan/shift/shiftCodeDictionary";
import {
  projectShiftRoster,
  type ShiftCellReading,
} from "@/lib/plan/shift/shiftRosterProjection";
import {
  cellCropRegion,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";
import { SourceCellCrop } from "./SourceCellCrop";

export interface ShiftReviewCell {
  day: number;
  date: string;
  rawCode: string;
  confidence: number;
}

interface ShiftReviewGridProps {
  cells: ShiftReviewCell[];
  dictionary: ShiftCodeDictionary;
  monthLabel: string;
  year: number;
  month: number;
  lowConfidenceThreshold?: number;
  /** 原稿画像（あれば sheet で該当セル crop を表示。無ければ placeholder） */
  imageSrc?: string;
  /** calibrated grid geometry（imageSrc とセットで crop 算出に使用） */
  geometry?: ShiftGridGeometry;
}

type CellKind = "empty" | "work" | "off" | "candidate" | "unresolved";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** Sakamoto: 0=Sun..6=Sat（pure・Date 非依存） */
function dayOfWeek(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (
    (yy +
      Math.floor(yy / 4) -
      Math.floor(yy / 100) +
      Math.floor(yy / 400) +
      t[m - 1] +
      d) %
    7
  );
}

function cellInfo(
  rawCode: string,
  dictionary: ShiftCodeDictionary
): { kind: CellKind; meaning: string; projectLabel: string } {
  if (normalizeRawCode(rawCode) === "")
    return { kind: "empty", meaning: "空欄", projectLabel: "反映なし" };
  const entry = lookupCode(dictionary, rawCode);
  if (!entry)
    return { kind: "unresolved", meaning: "未知（要確認）", projectLabel: "保存前に要確認" };
  switch (entry.projectMode) {
    case "timed_event":
      return {
        kind: "work",
        meaning: `${entry.displayLabel}（${entry.startTime ?? ""}–${entry.endTime ?? ""}）`,
        projectLabel: "予定として反映",
      };
    case "day_indicator":
      return { kind: "off", meaning: entry.displayLabel, projectLabel: "「休み」表示（枠なし）" };
    case "candidate":
      return { kind: "candidate", meaning: entry.displayLabel, projectLabel: "候補（控えめ表示）" };
    default:
      return { kind: "unresolved", meaning: "要確認", projectLabel: "保存前に要確認" };
  }
}

// 設計: 勤務=緑を figure（強い）/ 休み=淡く ground。色は一系統だけ強める（CEO）
const KIND_TINT: Record<CellKind, string> = {
  // 勤務 = 緑系を明確に（働く日が一目で浮く）
  work: "bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm shadow-emerald-200/40",
  // 休み = 淡く退く
  off: "bg-white/40 text-slate-400 border-slate-200/60",
  // 希望休 = 控えめな琥珀（休みと区別を残す・GPT）
  candidate: "bg-amber-50/70 text-amber-600 border-amber-200/70",
  // 空欄 = ほぼ無色
  empty: "bg-white/20 text-gray-300 border-slate-100",
  // 未知 = 要確認の赤
  unresolved: "bg-rose-100 text-rose-700 border-rose-300",
};

export function ShiftReviewGrid({
  cells: initialCells,
  dictionary,
  monthLabel,
  year,
  month,
  lowConfidenceThreshold = 0.7,
  imageSrc,
  geometry,
}: ShiftReviewGridProps) {
  const [cells, setCells] = useState<ShiftReviewCell[]>(initialCells);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const projection = useMemo(() => {
    const readings: ShiftCellReading[] = cells.map((c) => ({
      date: c.date,
      rawCode: c.rawCode,
    }));
    return projectShiftRoster(readings, dictionary);
  }, [cells, dictionary]);

  const emptyDays = useMemo(
    () =>
      new Set(
        cells.filter((c) => normalizeRawCode(c.rawCode) === "").map((c) => c.day)
      ),
    [cells]
  );
  const isBlankRisk = (c: ShiftReviewCell): boolean =>
    c.confidence < lowConfidenceThreshold ||
    emptyDays.has(c.day - 1) ||
    emptyDays.has(c.day + 1);

  // カレンダー週構築（先頭の曜日に空きを入れる）
  const weeks = useMemo(() => {
    const firstDow = dayOfWeek(year, month, 1);
    const slots: (ShiftReviewCell | null)[] = [
      ...Array<null>(firstDow).fill(null),
      ...[...cells].sort((a, b) => a.day - b.day),
    ];
    while (slots.length % 7 !== 0) slots.push(null);
    const out: (ShiftReviewCell | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) out.push(slots.slice(i, i + 7));
    return out;
  }, [cells, year, month]);

  const knownCodes = Object.values(dictionary.codes).map((e) => e.rawCode);
  const selectedCell = cells.find((c) => c.day === selectedDay) ?? null;

  function setRawCode(day: number, rawCode: string) {
    setCells((prev) =>
      prev.map((c) => (c.day === day ? { ...c, rawCode, confidence: 1 } : c))
    );
  }

  return (
    <GlassCard className="relative">
      <div data-testid="shift-review-grid">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {monthLabel} の取り込み確認
        </h2>
        <span className="text-[11px] text-gray-400">原稿と見比べて修正</span>
      </div>

      <p
        data-testid="shift-review-notice"
        className="mb-3 rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800 backdrop-blur"
      >
        強調（隅の印）は注意の補助です。<b>強調が無くても全セルを原稿と照合</b>してください。空欄が勝手に埋まる場合があります。
      </p>

      {/* 凡例（うるさくしない最小限） */}
      <div className="mb-2 flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-200" />勤務
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded border border-slate-200 bg-white" />休み
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />要確認
        </span>
      </div>

      {/* 曜日ヘッダ */}
      <div
        data-testid="shift-review-weekday-header"
        className="grid grid-cols-7 gap-1 px-0.5 pb-1"
      >
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-medium ${
              i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-gray-400"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* カレンダー grid */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} className="aspect-square" />;
          const { kind } = cellInfo(cell.rawCode, dictionary);
          const risk = isBlankRisk(cell);
          const selected = selectedDay === cell.day;
          const isEmpty = normalizeRawCode(cell.rawCode) === "";
          return (
            <button
              key={cell.day}
              type="button"
              data-testid={`shift-review-cell-${cell.day}`}
              data-kind={kind}
              data-blank-risk={risk ? "true" : "false"}
              onClick={() => setSelectedDay(cell.day)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border transition ${KIND_TINT[kind]} ${
                selected ? "ring-2 ring-sky-400 ring-offset-1" : ""
              }`}
            >
              <span className="absolute left-1.5 top-1 text-[9px] font-medium text-gray-400">
                {cell.day}
              </span>
              <span
                className={`text-[15px] font-extrabold leading-none tracking-tight ${
                  isEmpty ? "text-gray-300" : ""
                }`}
              >
                {isEmpty ? "·" : cell.rawCode}
              </span>
              {risk && (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400"
                  aria-label="要確認"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 下部 sticky preview */}
      <div
        data-testid="shift-review-preview"
        className="mt-3 flex items-center justify-between rounded-xl border border-white/50 bg-white/60 px-3 py-2 text-[11px] backdrop-blur"
      >
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-600">
          <span>勤務 <b className="text-sky-700">{projection.timedEvents.length}</b></span>
          <span>休み <b className="text-slate-600">{projection.dayIndicators.length}</b></span>
          <span>候補 <b className="text-amber-700">{projection.candidates.length}</b></span>
          <span className={projection.unresolved.length ? "text-rose-600" : ""}>
            要確認 <b>{projection.unresolved.length}</b>
          </span>
        </div>
        <button
          type="button"
          data-testid="shift-review-save"
          disabled
          className="cursor-not-allowed rounded-lg bg-gray-200/80 px-3 py-1 text-[11px] text-gray-400"
          title="保存は次段（DB 承認後）"
        >
          反映（次段で有効化）
        </button>
      </div>

      {/* セル詳細 bottom sheet */}
      {selectedCell && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSelectedDay(null)}
            aria-hidden="true"
          />
          <div
            data-testid="shift-review-sheet"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl border border-white/50 bg-white/80 p-4 shadow-2xl backdrop-blur-xl"
          >
            {(() => {
              const dow =
                WEEKDAYS[dayOfWeek(year, month, selectedCell.day)];
              const { meaning, projectLabel } = cellInfo(
                selectedCell.rawCode,
                dictionary
              );
              const isEmpty = normalizeRawCode(selectedCell.rawCode) === "";
              return (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">
                      {monthLabel.replace(/年.*/, "")}年{month}月{selectedCell.day}日（{dow}）
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedDay(null)}
                      className="text-xs text-gray-400"
                    >
                      閉じる
                    </button>
                  </div>

                  {/* 原稿セル crop（calibrated grid geometry から該当セルを切り出し） */}
                  <div className="mb-3 flex items-center gap-3">
                    {imageSrc && geometry ? (
                      <SourceCellCrop
                        imageSrc={imageSrc}
                        imageWidth={geometry.imageWidth}
                        imageHeight={geometry.imageHeight}
                        region={cellCropRegion(geometry, selectedCell.day)}
                      />
                    ) : (
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-[10px] text-gray-400">
                        原稿セル
                      </div>
                    )}
                    <div className="text-xs text-gray-600">
                      <div>
                        読み取り: <b className="text-base text-gray-900">{isEmpty ? "（空欄）" : selectedCell.rawCode}</b>
                      </div>
                      <div>意味: {meaning}</div>
                      <div className="text-gray-400">反映予定: {projectLabel}</div>
                    </div>
                  </div>

                  {/* 修正 picker */}
                  <p className="mb-1 text-[11px] text-gray-500">コードを修正</p>
                  <div className="flex flex-wrap gap-1.5">
                    {knownCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setRawCode(selectedCell.day, code)}
                        className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                          normalizeRawCode(code) === normalizeRawCode(selectedCell.rawCode)
                            ? "border-sky-400 bg-sky-50 text-sky-700"
                            : "border-gray-200 bg-white/70 hover:bg-gray-50"
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRawCode(selectedCell.day, "")}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        isEmpty
                          ? "border-sky-400 bg-sky-50 text-sky-700"
                          : "border-gray-200 bg-white/70 hover:bg-gray-50"
                      }`}
                    >
                      空欄
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
      </div>
    </GlassCard>
  );
}
