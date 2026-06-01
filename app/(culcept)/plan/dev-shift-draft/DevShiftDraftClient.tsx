"use client";

/**
 * DevShiftDraftClient — fixture host の client（SR B1b-2C-8-c-4）
 *
 * 本コミット（B1b-2C-8-c-4）の scope:
 *   - cells_loaded に「確認画面を開く」CTA を追加 → dispatch open_review。
 *   - selectImportModalProps（pure selector）経由で ShiftImportModal を条件 mount。
 *     riskReviewEnabled=true / chunkBoundaries=[15] / saveEnabled は server prop 由来 / imageSrc=ObjectURL。
 *   - Modal の onClose → close_review、onSuccess → save_succeeded（cells_loaded → saved）。
 *   - saved 状態で success banner + 「最初からやり直す」（→ cancel で idle へ）。
 *   - saved は imageObjectUrl を持たない → useEffect の差分検出が **自動 revoke**（CEO 要件）。
 *
 * 既存（8-c-2/8-c-3 で確立）:
 *   - state machine（idle / image_loaded / row_selected / extracting / cells_loaded / error）
 *   - targetMonth 入力 + crop + extract action wiring（VLM cost 入口は server action 経由のみ）
 *
 * 範囲外（**8-c-4 でやらない・CEO 禁止**）:
 *   - /plan 自動遷移（dev host では見送り）
 *   - saveEnabled hardcode true
 *   - staging smoke / VLM 再実行 / DB write の実行（PLAN_SHIFT_IMPORT_SAVE flag で dormant 維持）
 *
 * 不変原則（CEO 補正・2026-06-01）:
 *   - **File / Blob を React state に長期保持しない**（state は ObjectURL string + image metadata のみ）。
 *   - **base64 / dataURL を client で作らない**（imageObjectUrl は blob: URL のみ・FileReader 不使用）。
 *   - **localStorage に画像本体を入れない**（本 component は localStorage 不使用）。
 *   - **cells_loaded 直後に ObjectURL を revoke しない**（review に元画像必須・同一 URL 持ち越し）。
 *   - **saveEnabled は server-side flag 由来**（hardcode true なし・8-c-3 では未使用）。
 *   - **VLM は user action 時のみ**（callAction = server action。client から VLM を直接呼ばない）。
 *   - **extracting に入るのは crop 成功後**（invalid selection では loading にしない）。
 *
 * safe copy: 「検証 host」「製品の取り込み入口ではありません」で統一。
 *   「本流」「正式入口」「保存できます」「取り込み完了」は使わない。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { AssistedRowSelector } from "@/app/(culcept)/plan/components/AssistedRowSelector";
import { ShiftImportModal } from "@/app/(culcept)/plan/components/ShiftImportModal";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";
import { generateAssistedCrops } from "@/lib/plan/shift/assistedCropGenerator";
import { generateCombinedDraftImage } from "@/lib/plan/shift/combinedDraftImage";
import { runDraftExtractionSubmit } from "@/lib/plan/shift/runDraftExtractionSubmit";
import {
  selectImportModalProps,
  DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES,
} from "@/lib/plan/shift/devShiftDraftModalSelector";
import {
  buildDevShiftDraftDebugSummary,
  type DevShiftDraftDebugInput,
} from "@/lib/plan/shift/devShiftDraftDebugSummary";
import {
  daysInMonth,
  formatMonthInput,
  parseMonthInput,
} from "@/lib/plan/shift/targetMonth";

import { extractShiftDraftAction } from "../_actions/extractShiftDraftAction";
import {
  INITIAL_STATE,
  currentObjectUrls,
  devShiftDraftReducer,
  outcomeToAction,
  type DevShiftDraftAction,
  type ImageMeta,
} from "./devShiftDraftReducer";

export interface DevShiftDraftClientProps {
  /**
   * 保存導線の活性化。**server-side flag（PLAN_SHIFT_IMPORT_SAVE）由来**。
   * 8-c-4: ShiftImportModal の saveEnabled prop に pass-through。**hardcode true 禁止**。
   * 既定 false で dormant（test 環境では env 未設定 → false → Modal の保存 CTA は disabled placeholder）。
   */
  saveEnabled?: boolean;
  /** server が算出した既定年（現在月）。targetMonth の初期値に使う。 */
  defaultYear?: number;
  /** server が算出した既定月 1..12。 */
  defaultMonth?: number;
  /** VLM model 名（B1B_VLM_MODEL 由来）。debug summary 表示用。API key ではない。 */
  vlmModel?: string;
  /**
   * SR B1b-2C-9-FIX-2: VLM 画像入力モード（server-side env 由来）。
   *   - "split"（既定）: header + personRow 2 枚で送る
   *   - "combined": 上下結合 1 枚で送る（Z 案・Phase A FAIL 対策）
   * 注: server action は env で再評価して FormData と照合（client は mode を主張しない）。
   */
  vlmInputMode?: "split" | "combined";
}

/** blob: ObjectURL から HTMLImageElement を decode（browser 専用・transient）。 */
function decodeImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_decode_failed"));
    img.src = url;
  });
}

/** File → ObjectURL + 自然画像サイズ。失敗時は ObjectURL を revoke して reject。 */
async function loadImageMetadata(
  file: File
): Promise<{ imageObjectUrl: string; imageMeta: ImageMeta }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await decodeImageElement(url);
    return {
      imageObjectUrl: url,
      imageMeta: {
        width: img.naturalWidth,
        height: img.naturalHeight,
        mimeType: file.type,
        fileName: file.name,
        sizeBytes: file.size,
      },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

const SAFE_DECODE_NOTICE = "画像を読み取れませんでした。もう一度お試しください。";
const SAFE_SELECTION_NOTICE = "選択範囲をご確認ください。";
const SAFE_MONTH_NOTICE = "対象の年月を選んでください。";
const SAFE_RUNTIME_FAIL = "読み取りに失敗しました。もう一度お試しください。";

/** 安全な debug summary の表示（raw / base64 / key を含まない数値・座標のみ）。 */
function DebugSummaryView({
  summary,
}: {
  summary: import("@/lib/plan/shift/devShiftDraftDebugSummary").DevShiftDraftDebugSummary;
}) {
  const fmtCrop = (c: { width: number; height: number; sizeBytes: number } | null) =>
    c ? `${c.width}×${c.height} / ${Math.round(c.sizeBytes / 1024)}KB` : "—";
  const rows: Array<[string, string]> = [
    ["画像", `${summary.imageW}×${summary.imageH}`],
    ["対象", `${summary.targetYear}-${String(summary.targetMonth).padStart(2, "0")} / ${summary.daysInMonth}日`],
    ["header band", `${summary.headerBandTop}–${summary.headerBandBottom}`],
    ["person band", `${summary.personRowBandTop}–${summary.personRowBandBottom}`],
    ["header crop", fmtCrop(summary.headerCrop)],
    ["person crop", fmtCrop(summary.personRowCrop)],
    ["combined", fmtCrop(summary.combinedCrop)],
    ["chunks", summary.chunkRanges.map((r) => `${r.from}-${r.to}`).join(", ")],
    ["model", summary.model ?? "—"],
    ["elapsed", summary.elapsedMs != null ? `${summary.elapsedMs}ms` : "—"],
    ["cells", summary.cellsCount != null ? String(summary.cellsCount) : "—"],
    ["blank", summary.blankCount != null ? String(summary.blankCount) : "—"],
  ];
  return (
    <dl
      data-testid="dev-shift-draft-debug-summary"
      className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-500"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <dt className="text-slate-400">{k}</dt>
          <dd className="font-mono text-slate-600">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DevShiftDraftClient({
  saveEnabled,
  defaultYear,
  defaultMonth,
  vlmModel,
  vlmInputMode = "split",
}: DevShiftDraftClientProps = {}) {
  const [state, dispatch] = useReducer(devShiftDraftReducer, INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // targetMonth（"YYYY-MM"）。server 既定（現在月）があれば prefill、無ければ空。
  const [targetMonthValue, setTargetMonthValue] = useState<string>(
    defaultYear && defaultMonth ? formatMonthInput(defaultYear, defaultMonth) : ""
  );
  // 軽い inline 通知（invalid selection / decode 失敗 / 月未選択）。画像本体ではない。
  const [notice, setNotice] = useState<string | null>(null);
  // 抽出 elapsed ms（debug 表示用・数値のみ）。
  const [lastElapsedMs, setLastElapsedMs] = useState<number | null>(null);

  // ── ObjectURL revoke 監視（multi-URL set 差分）と unmount cleanup ──
  // crop_review は元画像 + 3 crop URL を持つ。crop_review を離れると 3 crop URL が
  // set から消え、ここで revoke される（元画像は持ち越し）。saved は全 URL を revoke。
  // cells_loaded への遷移では元画像 URL を持ち越すため自動 revoke は発火しない（CEO 補正）。
  const prevUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const next = currentObjectUrls(state);
    const nextSet = new Set(next);
    for (const url of prevUrlsRef.current) {
      if (!nextSet.has(url)) URL.revokeObjectURL(url);
    }
    prevUrlsRef.current = next;
  }, [state]);

  useEffect(() => {
    return () => {
      for (const url of prevUrlsRef.current) URL.revokeObjectURL(url);
      prevUrlsRef.current = [];
    };
  }, []);

  // ── handlers ──
  const handleSelectFile = useCallback(async (file: File) => {
    try {
      const { imageObjectUrl, imageMeta } = await loadImageMetadata(file);
      dispatch({ type: "image_loaded", imageObjectUrl, imageMeta });
      setNotice(null);
    } catch {
      setNotice(SAFE_DECODE_NOTICE);
    }
  }, []);

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void handleSelectFile(file);
      e.target.value = ""; // 同一ファイル連続選択でも change 発火
    },
    [handleSelectFile]
  );

  const triggerFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const onRowChange = useCallback((selection: AssistedRowSelection) => {
    dispatch({ type: "row_selected", selection });
  }, []);
  const onRowConfirm = useCallback((selection: AssistedRowSelection) => {
    dispatch({ type: "row_selected", selection });
  }, []);

  const onCancel = useCallback(() => {
    dispatch({ type: "cancel" });
    setNotice(null);
  }, []);

  /**
   * 9-FIX: クロップを確認（row_selected → crop_review）。VLM は呼ばない。
   * - month 未選択 / crop null → crop_review に入らず inline 通知（row_selected 維持）。
   * - header / personRow / combined（VLM に渡す予定の結合画像）を生成して preview。
   * - Blob は state に持たず、ObjectURL（string）+ 寸法のみ crop_review に載せる。
   */
  const handlePrepareCrops = useCallback(async () => {
    if (state.kind !== "row_selected") return;
    const { selection, imageObjectUrl } = state;

    const parsed = parseMonthInput(targetMonthValue);
    if (!parsed) {
      setNotice(SAFE_MONTH_NOTICE);
      return;
    }
    setNotice(null);
    try {
      const img = await decodeImageElement(imageObjectUrl);
      const cropsOut = await generateAssistedCrops(img, selection);
      const combinedOut = await generateCombinedDraftImage(img, selection);
      if (!cropsOut || !combinedOut) {
        setNotice(SAFE_SELECTION_NOTICE);
        return;
      }
      // Blob.size を読んでから ObjectURL 化（Blob は変数を抜けると ObjectURL が保持）。
      const headerCropUrl = URL.createObjectURL(cropsOut.header.blob);
      const personRowCropUrl = URL.createObjectURL(cropsOut.personRow.blob);
      const combinedCropUrl = URL.createObjectURL(combinedOut.blob);
      dispatch({
        type: "crops_prepared",
        year: parsed.year,
        month: parsed.month,
        headerCropUrl,
        personRowCropUrl,
        combinedCropUrl,
        cropMeta: {
          header: {
            width: cropsOut.header.region.width,
            height: cropsOut.header.region.height,
            sizeBytes: cropsOut.header.blob.size,
          },
          personRow: {
            width: cropsOut.personRow.region.width,
            height: cropsOut.personRow.region.height,
            sizeBytes: cropsOut.personRow.blob.size,
          },
          combined: {
            width: combinedOut.plan.combinedWidth,
            height: combinedOut.plan.combinedHeight,
            sizeBytes: combinedOut.blob.size,
          },
        },
      });
    } catch {
      setNotice(SAFE_DECODE_NOTICE);
    }
  }, [state, targetMonthValue]);

  const onBackToRowSelect = useCallback(
    () => dispatch({ type: "back_to_row_select" }),
    []
  );

  /**
   * この画像で読み取る（crop_review → 再crop → action → cells_loaded/error）。
   * - crop_review の year/month を使う（targetMonth は crops_prepared 時に確定済）。
   * - submit 時に再 crop（Blob を state に持たないため）。VLM は server action 経由のみ。
   */
  const handleExtract = useCallback(async () => {
    if (state.kind !== "crop_review") return;
    const { selection, imageObjectUrl, year, month } = state;
    const days = daysInMonth(year, month);
    setNotice(null);

    const t0 = Date.now();
    let actionStarted = false;
    try {
      // SR B1b-2C-9-FIX-2: mode で generate を切替（mode は server-side env 由来）。
      const baseDeps = {
        year,
        month,
        daysInMonth: days,
        callAction: extractShiftDraftAction,
        onActionStart: () => {
          actionStarted = true;
          dispatch({ type: "extract_started", year, month });
        },
      };
      const outcome = await runDraftExtractionSubmit(
        vlmInputMode === "combined"
          ? {
              ...baseDeps,
              mode: "combined" as const,
              generateCombined: async () => {
                const img = await decodeImageElement(imageObjectUrl);
                // Z 案: full-width combined / 2x upscale 既定（minWidth=1500 で薄い時のみ）
                return generateCombinedDraftImage(img, selection, {
                  minWidth: 1500,
                  gridline: true,
                });
              },
            }
          : {
              ...baseDeps,
              mode: "split" as const,
              generateCrops: async () => {
                const img = await decodeImageElement(imageObjectUrl);
                return generateAssistedCrops(img, selection);
              },
            }
      );
      setLastElapsedMs(Date.now() - t0);

      if (outcome.kind === "invalid_selection") {
        setNotice(SAFE_SELECTION_NOTICE);
        return;
      }
      const action = outcomeToAction(outcome);
      if (action) dispatch(action);
    } catch {
      setLastElapsedMs(Date.now() - t0);
      if (actionStarted) {
        dispatch({ type: "extract_failed", message: SAFE_RUNTIME_FAIL });
      } else {
        setNotice(SAFE_DECODE_NOTICE);
      }
    }
  }, [state]);

  const onRetry = useCallback(() => dispatch({ type: "extract_retry" }), []);

  // ── 8-c-4: 確認画面（ShiftImportModal）の開閉 + 保存成功 ──
  const onOpenReview = useCallback(() => dispatch({ type: "open_review" }), []);
  const onCloseReview = useCallback(() => dispatch({ type: "close_review" }), []);
  const onSaveSucceeded = useCallback(
    () => dispatch({ type: "save_succeeded" }),
    []
  );

  const isSelecting =
    state.kind === "image_loaded" || state.kind === "row_selected";

  // selector は pure: state.kind !== cells_loaded か reviewOpen=false なら null（mount しない）
  const modalProps = selectImportModalProps(state, { saveEnabled });

  return (
    <div
      data-testid="dev-shift-draft-host"
      data-state={state.kind}
      className="min-h-screen bg-slate-50 p-4"
    >
      <div className="mx-auto max-w-md space-y-3">
        <p
          data-testid="dev-shift-draft-warning"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
        >
          ⚠ staging/dev 限定の <b>下書き取り込み検証 host</b> です。
          製品の取り込み入口ではありません。
        </p>

        {/* hidden file input — どの state でも DOM に存在（再 trigger 可能にする） */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          data-testid="dev-shift-draft-file-input"
          onChange={onFileInputChange}
          className="hidden"
        />

        {notice && (
          <p
            data-testid="dev-shift-draft-notice"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
          >
            {notice}
          </p>
        )}

        {state.kind === "idle" && (
          <div
            data-testid="dev-shift-draft-idle"
            className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] leading-relaxed text-slate-600"
          >
            <p className="mb-3">
              シフト表の画像（PNG / JPEG）を選んで、下書きを取り出します。
            </p>
            <button
              type="button"
              data-testid="dev-shift-draft-pick-image"
              onClick={triggerFilePicker}
              className="rounded-lg bg-slate-800 px-3 py-2 text-[12px] font-medium text-white"
            >
              画像を選ぶ
            </button>
          </div>
        )}

        {isSelecting && (
          <div data-testid="dev-shift-draft-row-select" className="space-y-2">
            {/* targetMonth 入力（対象月が本質・現在月固定にしない／CEO 補正1） */}
            <label className="flex items-center gap-2 text-[11px] text-slate-600">
              <span>対象の年月</span>
              <input
                type="month"
                value={targetMonthValue}
                data-testid="dev-shift-draft-target-month"
                onChange={(e) => {
                  setTargetMonthValue(e.target.value);
                  setNotice(null);
                }}
                className="rounded border border-slate-300 px-2 py-1 text-[12px]"
              />
            </label>

            <AssistedRowSelector
              imageObjectUrl={state.imageObjectUrl}
              imageW={state.imageMeta.width}
              imageH={state.imageMeta.height}
              initialSelection={
                state.kind === "row_selected" ? state.selection : undefined
              }
              onChange={onRowChange}
              onConfirm={onRowConfirm}
              onCancel={onCancel}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="dev-shift-draft-replace-image"
                onClick={triggerFilePicker}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-700"
              >
                画像を選び直す
              </button>
              <button
                type="button"
                data-testid="dev-shift-draft-cancel"
                onClick={onCancel}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-600"
              >
                やり直す
              </button>
            </div>

            {state.kind === "row_selected" && (
              <button
                type="button"
                data-testid="dev-shift-draft-prepare-crops"
                onClick={() => void handlePrepareCrops()}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
              >
                クロップを確認
              </button>
            )}
          </div>
        )}

        {/* 9-FIX: crop_review — VLM に渡す予定の画像を確認（VLM はまだ呼ばない）。 */}
        {state.kind === "crop_review" && (
          <div
            data-testid="dev-shift-draft-crop-review"
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600"
          >
            {/* targetMonth 整合（画像の月と一致しているか目視確認） */}
            <div
              data-testid="dev-shift-draft-month-integrity"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800"
            >
              対象の年月: <b>{`${state.year}年${state.month}月`}</b>
              {`（日数 ${daysInMonth(state.year, state.month)}）。`}
              <br />
              元画像の年月と一致していますか？ ズレていると日付変換が崩れます。
            </div>

            <p className="font-medium">VLM に渡す予定の画像</p>
            {/* combined = 実際に渡したい 1 枚（header 上 + 本人行 下、同 X 軸）。 */}
            <figure className="space-y-1">
              <figcaption className="text-[11px] text-slate-500">
                結合画像（日付ヘッダ＋本人行・同じ横幅で上下結合）
              </figcaption>
              <img
                data-testid="dev-shift-draft-combined-preview"
                src={state.combinedCropUrl}
                alt="結合プレビュー"
                className="w-full rounded border border-slate-300"
              />
            </figure>
            <div className="grid grid-cols-2 gap-2">
              <figure className="space-y-1">
                <figcaption className="text-[11px] text-slate-500">日付ヘッダ</figcaption>
                <img
                  data-testid="dev-shift-draft-header-preview"
                  src={state.headerCropUrl}
                  alt="ヘッダ"
                  className="w-full rounded border border-slate-300"
                />
              </figure>
              <figure className="space-y-1">
                <figcaption className="text-[11px] text-slate-500">本人行</figcaption>
                <img
                  data-testid="dev-shift-draft-person-row-preview"
                  src={state.personRowCropUrl}
                  alt="本人行"
                  className="w-full rounded border border-slate-300"
                />
              </figure>
            </div>

            <DebugSummaryView
              summary={buildDevShiftDraftDebugSummary({
                imageW: state.imageMeta.width,
                imageH: state.imageMeta.height,
                year: state.year,
                month: state.month,
                daysInMonth: daysInMonth(state.year, state.month),
                headerBand: state.selection.headerBand,
                personRowBand: state.selection.personRowBand,
                crops: {
                  header: state.cropMeta.header,
                  personRow: state.cropMeta.personRow,
                  combined: state.cropMeta.combined,
                },
                chunkBoundaries: DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES,
                model: vlmModel,
              })}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="dev-shift-draft-back-to-select"
                onClick={onBackToRowSelect}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-700"
              >
                行指定に戻る
              </button>
              <button
                type="button"
                data-testid="dev-shift-draft-extract"
                onClick={() => void handleExtract()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
              >
                この画像で読み取る
              </button>
            </div>
          </div>
        )}

        {state.kind === "extracting" && (
          <div
            data-testid="dev-shift-draft-extracting"
            className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500"
          >
            {`${state.year}年${state.month}月の下書きを取り出しています…`}
          </div>
        )}

        {state.kind === "cells_loaded" && (
          <div
            data-testid="dev-shift-draft-cells-loaded"
            className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-600"
          >
            <p data-testid="dev-shift-draft-cells-count" className="font-medium">
              {`${state.year}年${state.month}月 — ${state.cells.length} 件の下書きを読み取りました。`}
            </p>
            {/* 最小サマリ（day: rawCode）。詳細確認は「確認画面を開く」CTA から。 */}
            <ul className="grid grid-cols-4 gap-1 text-[11px] text-slate-500">
              {state.cells.map((c) => (
                <li
                  key={c.day}
                  className="rounded border border-slate-200 px-1 py-0.5 text-center"
                >
                  {`${c.day} ${c.rawCode}`}
                </li>
              ))}
            </ul>

            <DebugSummaryView
              summary={buildDevShiftDraftDebugSummary({
                imageW: state.imageMeta.width,
                imageH: state.imageMeta.height,
                year: state.year,
                month: state.month,
                daysInMonth: daysInMonth(state.year, state.month),
                headerBand: state.selection.headerBand,
                personRowBand: state.selection.personRowBand,
                chunkBoundaries: DEV_SHIFT_DRAFT_CHUNK_BOUNDARIES,
                model: vlmModel,
                elapsedMs: lastElapsedMs ?? undefined,
                cells: state.cells,
              })}
            />

            {/* CEO 補正: Modal は自動 open せず、必ず CTA を挟む */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="dev-shift-draft-open-review"
                onClick={onOpenReview}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
              >
                確認画面を開く
              </button>
              <button
                type="button"
                data-testid="dev-shift-draft-restart"
                onClick={onCancel}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-600"
              >
                最初からやり直す
              </button>
            </div>
          </div>
        )}

        {/* 8-c-4: saved 終端 — success banner + 「最初からやり直す」。
            saved 状態には imageObjectUrl が無い → useEffect 差分検出で自動 revoke 発火。 */}
        {state.kind === "saved" && (
          <div
            data-testid="dev-shift-draft-saved"
            className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[12px] leading-relaxed text-emerald-800"
          >
            <p data-testid="dev-shift-draft-saved-message" className="font-medium">
              {`${state.year}年${state.month}月 — ${state.cellCount} 件を反映しました。`}
            </p>
            <p className="text-[11px] text-emerald-700">
              続けて別の月を取り込むには、最初からやり直してください。
            </p>
            <button
              type="button"
              data-testid="dev-shift-draft-saved-restart"
              onClick={onCancel}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] text-emerald-700"
            >
              最初からやり直す
            </button>
          </div>
        )}

        {state.kind === "error" && (
          <div
            data-testid="dev-shift-draft-error"
            className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] leading-relaxed text-rose-700"
          >
            <p>{state.message}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="dev-shift-draft-retry"
                onClick={onRetry}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white"
              >
                もう一度試す
              </button>
              <button
                type="button"
                data-testid="dev-shift-draft-error-cancel"
                onClick={onCancel}
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] text-rose-600"
              >
                やり直す
              </button>
            </div>
          </div>
        )}

        {/* 8-c-4: ShiftImportModal 条件 mount。
            selector が null を返す（cells_loaded.reviewOpen=false / 他状態）と一切 mount しない。
            saveEnabled は server prop 由来（hardcode true なし）。
            riskReviewEnabled=true / chunkBoundaries=[15] は selector で hardcode（dev host 検証用）。 */}
        {modalProps && (
          <ShiftImportModal
            open={modalProps.open}
            year={modalProps.year}
            month={modalProps.month}
            cells={modalProps.cells}
            saveEnabled={modalProps.saveEnabled}
            imageSrc={modalProps.imageSrc}
            riskReviewEnabled={modalProps.riskReviewEnabled}
            chunkBoundaries={modalProps.chunkBoundaries}
            onSuccess={onSaveSucceeded}
            onClose={onCloseReview}
          />
        )}
      </div>
    </div>
  );
}
