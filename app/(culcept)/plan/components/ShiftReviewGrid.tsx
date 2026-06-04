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
  sourceColumnForDay,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";
import { SourceCellCrop } from "./SourceCellCrop";
import { SourceImageHighlight } from "./SourceImageHighlight";
import { SourceCellZoom } from "./SourceCellZoom";
import {
  type ShiftReviewCell,
  computeEmptyDays,
  isBlankRisk,
} from "@/lib/plan/shift/shiftReviewClassification";
import {
  buildShiftReviewWeeks,
  dayOfWeek,
  daysInMonth,
} from "@/lib/plan/shift/shiftReviewCalendar";
import {
  type ShiftSaveState,
  SHIFT_SAVE_CONFIRM_MESSAGE,
} from "@/lib/plan/shift/shiftSaveController";
import {
  detectDraftRisks,
  type DraftRiskReport,
} from "@/lib/plan/shift/shiftDraftRiskModel";

export type { ShiftReviewCell };

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
  // ── SR Step 6D: 保存 CTA contract（host が wire。未指定なら dormant placeholder のまま）──
  /** 保存導線を出すか（flag OFF / host 未設定なら false → 旧 disabled placeholder）。 */
  saveEnabled?: boolean;
  /** 保存状態（host の controller から。CTA/status の表示を駆動）。 */
  saveState?: ShiftSaveState;
  /** 保存要求（現在のセルを渡す。host が controller.requestSave に繋ぐ）。 */
  onConfirm?: (cells: ShiftReviewCell[]) => void | Promise<void>;
  /** blank-risk soft confirm 後の続行（controller.confirmBlankRisk）。 */
  onConfirmBlankRisk?: () => void | Promise<void>;
  /** 確認/結果から戻る（controller.cancel）。 */
  onCancel?: () => void;
  // ── SR B1b-2B: golden-free risk review hint（既定 OFF で dormant = 既存挙動不変）──
  /** true で draft risk hint を表示 + hard risk を保存 block。risk 計算は shiftDraftRiskModel に委譲。 */
  riskReviewEnabled?: boolean;
  /** draft 抽出の chunk 境目（例: [15]）。chunk_boundary hint に使う（任意）。 */
  chunkBoundaries?: number[];
}

type CellKind = "empty" | "work" | "off" | "candidate" | "unresolved";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

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
  saveEnabled,
  saveState,
  onConfirm,
  onConfirmBlankRisk,
  onCancel,
  riskReviewEnabled = false,
  chunkBoundaries,
}: ShiftReviewGridProps) {
  const [cells, setCells] = useState<ShiftReviewCell[]>(initialCells);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const highlightDay = hoveredDay ?? selectedDay;
  // S3A-2-4: 原稿（元画像）インライン照合の開閉。既定=閉（確認画面を重くしない）。
  const [showSource, setShowSource] = useState(false);

  // 空の日（コード無し）= 原画像で詰められた日。highlight/crop の列写像で空をスキップ
  const blankDays = useMemo(
    () =>
      cells
        .filter((c) => normalizeRawCode(c.rawCode) === "")
        .map((c) => c.day),
    [cells]
  );

  const projection = useMemo(() => {
    const readings: ShiftCellReading[] = cells.map((c) => ({
      date: c.date,
      rawCode: c.rawCode,
    }));
    return projectShiftRoster(readings, dictionary);
  }, [cells, dictionary]);

  // blank-risk 判定は shiftReviewClassification（controller の保存前 gate と同一 source）
  const emptyDays = useMemo(() => computeEmptyDays(cells), [cells]);
  const cellIsBlankRisk = (c: ShiftReviewCell): boolean =>
    isBlankRisk(c, emptyDays, lowConfidenceThreshold);

  // カレンダー週構築（各日を真の曜日スロットへ配置。欠け日も実カレンダー位置を保つ）
  const weeks = useMemo(
    () => buildShiftReviewWeeks(cells, year, month),
    [cells, year, month]
  );

  const knownCodes = Object.values(dictionary.codes).map((e) => e.rawCode);
  const selectedCell = cells.find((c) => c.day === selectedDay) ?? null;

  function setRawCode(day: number, rawCode: string) {
    setCells((prev) =>
      prev.map((c) => (c.day === day ? { ...c, rawCode, confidence: 1 } : c))
    );
  }

  // ── SR B1b-2B: draft risk hint（golden-free）。計算は shiftDraftRiskModel に委譲（Grid は表示器）。
  //    cells は内部編集 state のため、編集追従のため内部 cells で再計算（projection と同パターン）。
  //    riskReviewEnabled=false（既定）なら null = dormant（既存挙動・dev fixture 不変）。
  const riskReport: DraftRiskReport | null = useMemo(() => {
    if (!riskReviewEnabled) return null;
    return detectDraftRisks(
      cells.map((c) => ({ day: c.day, rawCode: c.rawCode, confidence: c.confidence })),
      dictionary,
      {
        daysInMonth: daysInMonth(year, month),
        lowConfidenceThreshold,
        ...(chunkBoundaries ? { chunkBoundaries } : {}),
      }
    );
  }, [riskReviewEnabled, cells, dictionary, year, month, lowConfidenceThreshold, chunkBoundaries]);
  const hardRiskHints = riskReport?.hints.filter((h) => h.severity === "hard") ?? [];
  const softRiskHints = riskReport?.hints.filter((h) => h.severity === "soft") ?? [];

  // ── 保存 CTA（6D contract）: saveEnabled かつ onConfirm がある時のみ active。未指定は dormant placeholder ──
  const activeSave = saveEnabled === true && typeof onConfirm === "function";
  const hasUnresolved = projection.unresolved.length > 0;
  // hard risk（missing/duplicate/unknown）も保存前解消必須 → block に合流
  const blockSave = hasUnresolved || (riskReport?.hasBlockingRisk ?? false);
  const saveStatus: ShiftSaveState["status"] = saveState?.status ?? "idle";

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

      {/* カレンダー grid（各日を真の曜日スロットへ配置。欠け日も実カレンダー位置に表示） */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((slot, idx) => {
          if (!slot) return <div key={`pad-${idx}`} className="aspect-square" />;
          const { day, cell } = slot;
          if (!cell) {
            // 欠け日（抽出セルなし）= 実カレンダー位置に日番号だけ薄く表示。
            // 原稿照合で「読み取りの穴」がその日の位置に一目で浮く（連番詰めズレを根絶）。
            return (
              <div
                key={`gap-${day}`}
                data-testid={`shift-review-gap-${day}`}
                className="relative flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/60 bg-white/10"
              >
                <span className="absolute left-1.5 top-1 text-[9px] font-medium text-gray-300">
                  {day}
                </span>
                <span
                  className="text-[13px] leading-none text-slate-300"
                  aria-hidden="true"
                >
                  ·
                </span>
              </div>
            );
          }
          const { kind } = cellInfo(cell.rawCode, dictionary);
          const risk = cellIsBlankRisk(cell);
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
              onMouseEnter={() => setHoveredDay(cell.day)}
              onMouseLeave={() => setHoveredDay(null)}
              onFocus={() => setHoveredDay(cell.day)}
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

      {/* 原稿の該当セル拡大（S-geo-3: hover/tap した日のセルを crop 拡大＋太枠＝参照元を四角く強調）。
          highlightDay null（未 hover/未選択）なら SourceCellZoom 側で非表示（fail-soft）。 */}
      {imageSrc && geometry && (
        <SourceCellZoom
          imageSrc={imageSrc}
          geometry={geometry}
          day={highlightDay}
          blankDays={blankDays}
        />
      )}

      {/* 原稿画像 全体 + 該当日ハイライト（俯瞰・hover/tap で光る）。案A 推奨で併存。 */}
      {imageSrc && geometry && (
        <SourceImageHighlight
          imageSrc={imageSrc}
          geometry={geometry}
          highlightDay={highlightDay}
          blankDays={blankDays}
        />
      )}

      {/* S3A-2-4: 原稿（元画像）インライン照合。imageSrc がある時だけ（fixture 経路は無→非表示）。
          geometry 不要の簡易照合（別ウィンドウ不要で並べて目視）。折りたたみ初期=閉。
          ObjectURL lifecycle は呼出側 hook の責務（ここで生成/revoke せず src を表示するだけ）。
          collapse は CSS（hidden）で img は DOM 常在（ObjectURL は in-memory・render contract 固定用）。 */}
      {imageSrc && (
        <div data-testid="shift-review-source-section" className="mt-3">
          <button
            type="button"
            data-testid="shift-review-source-toggle"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="flex w-full items-center justify-between rounded-xl border border-sky-200/70 bg-sky-50/70 px-3 py-2 text-[12px] font-medium text-sky-800 transition hover:bg-sky-50"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="m3 16 5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="2" />
              </svg>
              原稿を表示して照合
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`transition-transform ${showSource ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <div
            data-testid="shift-review-source-body"
            className={showSource ? "mt-2" : "hidden"}
          >
            <img
              data-testid="shift-review-source-image"
              src={imageSrc}
              alt="取り込んだ原稿（シフト表）"
              className="max-h-[50vh] w-full rounded-xl border border-slate-200 bg-white object-contain"
            />
            <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
              原稿と上のセルを見比べて、コード・曜日・空欄をご確認ください。
            </p>
          </div>
        </div>
      )}

      {/* SR B1b-2B: draft risk hints（原稿照合の補助）。hard=保存前解消必須 / soft=確認おすすめ。
          ※ 誤り確定ではなく review hint。文言は shiftDraftRiskModel の safe copy。 */}
      {riskReport && riskReport.hints.length > 0 && (
        <div data-testid="shift-review-risk-panel" className="mt-3 space-y-1.5">
          {hardRiskHints.length > 0 && (
            <div
              data-testid="shift-review-risk-hard"
              className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700"
            >
              <p className="mb-1 font-semibold">要確認（保存前に解消してください）</p>
              <ul className="space-y-0.5">
                {hardRiskHints.map((h) => (
                  <li key={h.kind} data-testid={`shift-review-risk-${h.kind}`} data-severity="hard">
                    ・{h.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {softRiskHints.length > 0 && (
            <div
              data-testid="shift-review-risk-soft"
              className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800"
            >
              <p className="mb-1">原稿と照合してください（確認おすすめ）</p>
              <ul className="space-y-0.5">
                {softRiskHints.map((h) => (
                  <li key={h.kind} data-testid={`shift-review-risk-${h.kind}`} data-severity="soft">
                    ・{h.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
        {activeSave ? (
          <button
            type="button"
            data-testid="shift-review-save"
            disabled={blockSave || saveStatus === "saving"}
            onClick={() => {
              void onConfirm?.(cells);
            }}
            className={`rounded-lg px-3 py-1 text-[11px] ${
              blockSave || saveStatus === "saving"
                ? "cursor-not-allowed bg-gray-200/80 text-gray-400"
                : "bg-sky-500 text-white shadow-sm shadow-sky-200/50"
            }`}
            title={blockSave ? "要確認のセルを解決してください" : "この内容で保存"}
          >
            {saveStatus === "saving"
              ? "保存中…"
              : blockSave
                ? "要確認あり"
                : "この内容で保存"}
          </button>
        ) : (
          <button
            type="button"
            data-testid="shift-review-save"
            disabled
            className="cursor-not-allowed rounded-lg bg-gray-200/80 px-3 py-1 text-[11px] text-gray-400"
            title="保存は次段（DB 承認後）"
          >
            反映（次段で有効化）
          </button>
        )}
      </div>

      {/* 保存 status region（6D: active save 時のみ。文言はすべて safe・raw なし）*/}
      {activeSave && saveState?.status === "needs_blank_risk_confirmation" && (
        <div
          data-testid="shift-review-blank-confirm"
          className="mt-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800"
        >
          <p className="mb-2">
            {SHIFT_SAVE_CONFIRM_MESSAGE}（要確認 {saveState.blankRiskDays.length} 日）
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="shift-review-blank-confirm-proceed"
              onClick={() => {
                void onConfirmBlankRisk?.();
              }}
              className="rounded-lg bg-amber-500 px-3 py-1 text-white"
            >
              照合した・保存する
            </button>
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="rounded-lg border border-slate-200 bg-white/70 px-3 py-1 text-gray-500"
            >
              戻る
            </button>
          </div>
        </div>
      )}
      {activeSave && saveState?.status === "success" && (
        <p
          data-testid="shift-review-save-success"
          className="mt-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800"
        >
          勤務 {saveState.summary.insertedAnchors} 件・休み{" "}
          {saveState.summary.insertedIndicators} 件を反映しました
        </p>
      )}
      {activeSave && saveState?.status === "conflict" && (
        <p
          data-testid="shift-review-save-conflict"
          className="mt-2 rounded-xl border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700"
        >
          {saveState.message}（{saveState.dates.join("、")}）
        </p>
      )}
      {activeSave &&
        (saveState?.status === "error" ||
          saveState?.status === "unresolved_blocked") && (
          <p
            data-testid="shift-review-save-error"
            className="mt-2 rounded-xl border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700"
          >
            {saveState.message}
          </p>
        )}

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
                      isEmpty ? (
                        <div className="flex h-12 w-20 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] leading-tight text-slate-400">
                          <span>空欄</span>
                          <span>該当セルなし</span>
                        </div>
                      ) : (
                        <SourceCellCrop
                          imageSrc={imageSrc}
                          imageWidth={geometry.imageWidth}
                          imageHeight={geometry.imageHeight}
                          region={cellCropRegion(
                            geometry,
                            sourceColumnForDay(selectedCell.day, blankDays)
                          )}
                        />
                      )
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
