"use client";

/**
 * useShiftDraftFlow — シフト下書き抽出 flow の共有 hook（S3A-2-1）
 *
 * 役割: dev route と（後続 S3A-2-2 で）在app入口の双方が使う「画像→行選択→crop→
 *   live VLM submit→cells」の **危険なロジック**を一箇所に集約する:
 *     - state machine（`devShiftDraftReducer` を現状位置のまま import 再利用）
 *     - ObjectURL lifecycle（生成は client・revoke は差替/cancel/unmount で本 hook が所有）
 *     - crop/combined 生成 + `extractShiftDraftAction` submit（VLM は user action 時のみ）
 *     - safe error / 連打防止（state machine で extracting 中は再 submit 不可）
 *
 * presentation は共有しない（dev=debug chrome / in-app=product clean）。本 hook は
 *   state + handlers + derived を返すだけ。saveEnabled / vlmModel / debug 表示は consumer 責務。
 *
 * 不変原則（既存 DevShiftDraftClient から移設・挙動不変）:
 *   - File / Blob を state に持たない（reducer 型で構造禁止・本 hook も保持しない）
 *   - base64 / dataURL を作らない（`URL.createObjectURL` のみ・`FileReader` 不使用）
 *   - VLM は handleExtract（user action）時のみ。auto 呼出・auto-retry なし
 *   - ObjectURL は `currentObjectUrls` 差分 + unmount で revoke
 *   - 結果は cells のみ（`extractShiftDraftAction` が Blob/base64/raw response を構造排除）
 *
 * S3A-2-1 範囲: dev route の source-of-truth 化のみ。in-app 接続は S3A-2-2（本 hook を消費）。
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";

import type {
  AssistedRowSelection,
  GridCalibration,
} from "@/lib/plan/shift/assistedRowSelection";
import { buildImageFingerprint } from "@/lib/plan/shift/assistedRowSelection";
import {
  saveAssistedSelection,
  loadAssistedSelection,
} from "@/lib/plan/shift/assistedSelectionStorage";
import { generateAssistedCrops } from "@/lib/plan/shift/assistedCropGenerator";
import { generateCombinedDraftImage } from "@/lib/plan/shift/combinedDraftImage";
import { runDraftExtractionSubmit } from "@/lib/plan/shift/runDraftExtractionSubmit";
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
  type DevShiftDraftState,
  type ImageMeta,
} from "../dev-shift-draft/devShiftDraftReducer";

// ── safe copy（inline 通知・画像本体ではない） ──
const SAFE_DECODE_NOTICE = "画像を読み取れませんでした。もう一度お試しください。";
const SAFE_SELECTION_NOTICE = "選択範囲をご確認ください。";
const SAFE_MONTH_NOTICE = "対象の年月を選んでください。";
const SAFE_RUNTIME_FAIL = "読み取りに失敗しました。もう一度お試しください。";

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

export interface UseShiftDraftFlowOptions {
  /** VLM 画像入力モード（server-side env 由来・consumer が prop で受け渡し）。 */
  vlmInputMode?: "split" | "combined";
  /** 既定年（targetMonth prefill 用）。 */
  defaultYear?: number;
  /** 既定月 1..12（targetMonth prefill 用）。 */
  defaultMonth?: number;
}

/** hook が返す flow API（presentation 非依存・consumer が JSX を組む）。 */
export interface ShiftDraftFlowApi {
  state: DevShiftDraftState;
  fileInputRef: RefObject<HTMLInputElement | null>;
  targetMonthValue: string;
  setTargetMonthValue: (v: string) => void;
  notice: string | null;
  /** notice を消す等。JSX が直接呼ぶため公開（consumer presentation 側で利用）。 */
  setNotice: (value: string | null) => void;
  lastElapsedMs: number | null;
  // 注: isSelecting（= image_loaded | row_selected）は hook から出さない。
  //   各 consumer がローカルで `state.kind === ...` から導出する（TS の aliased
  //   discriminant narrowing を JSX 内で効かせるため）。
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  triggerFilePicker: () => void;
  onRowChange: (selection: AssistedRowSelection) => void;
  onRowConfirm: (selection: AssistedRowSelection) => void;
  onCancel: () => void;
  handlePrepareCrops: () => Promise<void>;
  onBackToRowSelect: () => void;
  handleExtract: () => Promise<void>;
  onRetry: () => void;
  onOpenReview: () => void;
  onCloseReview: () => void;
  onSaveSucceeded: () => void;
  /** S-geo Persist-2: グリッド校正の正本を selection.gridCalibration に set / clear（null=reset）。 */
  onSetGridCalibration: (gridCalibration: GridCalibration | null) => void;
}

export function useShiftDraftFlow(
  options: UseShiftDraftFlowOptions = {}
): ShiftDraftFlowApi {
  const { vlmInputMode = "split", defaultYear, defaultMonth } = options;

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

  // ── S-geo Persist-3: グリッド校正の localStorage 永続化（座標のみ・per-image fingerprint key） ──
  //   正本は reducer の selection.gridCalibration。**新しい serialize 経路は作らず**、既存 pure 契約
  //   （toStoredPayload/parseStoredPayload/makeStorageKey）に SSR 安全 IO だけを足した
  //   assistedSelectionStorage 経由で localStorage に乗せる。raw 画像/base64 は型 + parse で構造排除済。
  //   - WRITE は onSetGridCalibration の **write-through**（下の callback）で行う
  //     （cells_loaded 到達時の素の selection を初回 restore より先に上書きする race を避ける）。
  //   - RESTORE は本 effect（read-only・write しない）。
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);
  const hydratedFingerprintRef = useRef<string | null>(null);

  // 現 state（cells_loaded）の image fingerprint（imageMeta 由来・画像 byte 不要）。
  const cellsLoadedFingerprint =
    state.kind === "cells_loaded"
      ? buildImageFingerprint({
          size: state.imageMeta.sizeBytes,
          imageW: state.imageMeta.width,
          imageH: state.imageMeta.height,
          nameTail: state.imageMeta.fileName,
        })
      : null;

  // RESTORE: cells_loaded 到達時に **fingerprint ごと 1 回だけ** localStorage から復元を試みる。
  //   - session 中に既に gridCalibration があれば上書きしない（session 値を尊重）。
  //   - 再 mount では ref が初期化され、保存済 gridCalibration が復元される（= remount restore）。
  //   - reset 後の再 hydrate は ref（同 fingerprint）で抑止（古い校正値の復活を防ぐ）。
  useEffect(() => {
    if (state.kind !== "cells_loaded" || !cellsLoadedFingerprint) return;
    if (hydratedFingerprintRef.current === cellsLoadedFingerprint) return;
    hydratedFingerprintRef.current = cellsLoadedFingerprint;
    if (state.selection.gridCalibration) return;
    const stored = loadAssistedSelection(cellsLoadedFingerprint);
    if (stored?.gridCalibration) {
      dispatch({
        type: "set_grid_calibration",
        gridCalibration: stored.gridCalibration,
      });
    }
  }, [state, cellsLoadedFingerprint]);

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
    (e: ChangeEvent<HTMLInputElement>) => {
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
   * クロップを確認（row_selected → crop_review）。VLM は呼ばない。
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
      // mode で generate を切替（mode は server-side env 由来）。
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
  }, [state, vlmInputMode]);

  const onRetry = useCallback(() => dispatch({ type: "extract_retry" }), []);

  // ── 確認画面（ShiftImportModal）の開閉 + 保存成功 ──
  const onOpenReview = useCallback(() => dispatch({ type: "open_review" }), []);
  const onCloseReview = useCallback(() => dispatch({ type: "close_review" }), []);
  const onSaveSucceeded = useCallback(
    () => dispatch({ type: "save_succeeded" }),
    []
  );
  const onSetGridCalibration = useCallback(
    (gridCalibration: GridCalibration | null) => {
      dispatch({ type: "set_grid_calibration", gridCalibration });
      // S-geo Persist-3 write-through: dispatch と同じ入力で localStorage を更新（最新 state を ref から）。
      //   set(cal): gridCalibration を載せて保存 / reset(null): 外して保存（stored から消える・
      //   dayColumns/bands は残る）。fingerprint は imageMeta 由来（画像 byte 不要）。
      const s = latestStateRef.current;
      if (s.kind !== "cells_loaded") return;
      const fp = buildImageFingerprint({
        size: s.imageMeta.sizeBytes,
        imageW: s.imageMeta.width,
        imageH: s.imageMeta.height,
        nameTail: s.imageMeta.fileName,
      });
      const { gridCalibration: _drop, ...baseSelection } = s.selection;
      const nextSelection: AssistedRowSelection = gridCalibration
        ? { ...baseSelection, gridCalibration, imageFingerprint: fp }
        : { ...baseSelection, imageFingerprint: fp };
      saveAssistedSelection(nextSelection, new Date().toISOString());
    },
    []
  );

  return {
    state,
    fileInputRef,
    targetMonthValue,
    setTargetMonthValue,
    notice,
    setNotice,
    lastElapsedMs,
    onFileInputChange,
    triggerFilePicker,
    onRowChange,
    onRowConfirm,
    onCancel,
    handlePrepareCrops,
    onBackToRowSelect,
    handleExtract,
    onRetry,
    onOpenReview,
    onCloseReview,
    onSaveSucceeded,
    onSetGridCalibration,
  };
}
