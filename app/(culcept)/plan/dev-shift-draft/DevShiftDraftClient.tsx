"use client";

/**
 * DevShiftDraftClient — fixture host の client（SR B1b-2C-8-c-2）
 *
 * 本コミット（B1b-2C-8-c-2）の scope:
 *   - state machine（6 状態、idle / image_loaded / row_selected / extracting / cells_loaded / error）
 *     のうち idle / image_loaded / row_selected の遷移のみ実装。
 *   - file input（accept=image/png,image/jpeg）
 *   - URL.createObjectURL で blob: URL 生成 + HTMLImageElement で naturalWidth/Height 取得
 *   - AssistedRowSelector mount（既存 component / B1b-2C-2）
 *   - ObjectURL revoke lifecycle:
 *       - 差替 / cancel / unmount で revoke
 *       - **cells_loaded への遷移では同一 URL を引き継ぐ → 自動 revoke は発火しない**（review に元画像必須）
 *   - saveEnabled server prop の受け取り（8-c-4 で Modal mount に渡す予定）。
 *
 * 範囲外（**8-c-3 以降で接続**）:
 *   - generateAssistedCrops（B1b-2C-3）
 *   - FormData 作成
 *   - extractShiftDraftAction 呼出（B1b-2C-7）
 *   - ShiftImportModal mount（B1b-2C-8-c-4）
 *   - 保存 / DB write / VLM 実行 / staging smoke
 *
 * 不変原則（CEO 補正・2026-06-01）:
 *   - **File / Blob を React state に長期保持しない**（state に File 系 field なし — 構造的保証）。
 *   - **base64 / dataURL を client で作らない**（imageObjectUrl は `blob:` URL のみ）。
 *   - **localStorage に画像本体を入れない**（本 component は localStorage を一切触らない）。
 *   - **cells_loaded 直後に ObjectURL を revoke しない**（同一 URL を持ち越す設計）。
 *   - **saveEnabled は hardcode true にしない** — page.tsx が `isShiftImportSaveEnabled()` を読んで渡す。
 *
 * safe copy: 「検証 host」「製品の取り込み入口ではありません」で統一。
 *   「本流」「正式入口」「保存できます」「取り込み完了」は使わない。
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import { AssistedRowSelector } from "@/app/(culcept)/plan/components/AssistedRowSelector";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";

import {
  INITIAL_STATE,
  currentImageObjectUrl,
  devShiftDraftReducer,
  type DevShiftDraftAction,
  type ImageMeta,
} from "./devShiftDraftReducer";

export interface DevShiftDraftClientProps {
  /**
   * 保存導線の活性化。**server-side flag（PLAN_SHIFT_IMPORT_SAVE）由来**。
   * 本コミット（8-c-2）では UI には出さない（ShiftImportModal mount は 8-c-4）。
   * 既定 false で dormant。**hardcode true は禁止**。
   */
  saveEnabled?: boolean;
}

/** File → ObjectURL + 自然画像サイズ取得（client 専用）。失敗時は ObjectURL を revoke して reject。 */
async function loadImageMetadata(
  file: File
): Promise<{ imageObjectUrl: string; imageMeta: ImageMeta }> {
  const url = URL.createObjectURL(file);
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        imageObjectUrl: url,
        imageMeta: {
          width: img.naturalWidth,
          height: img.naturalHeight,
          mimeType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
        },
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

export function DevShiftDraftClient(_props: DevShiftDraftClientProps = {}) {
  const [state, dispatch] = useReducer(devShiftDraftReducer, INITIAL_STATE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── ObjectURL revoke 監視（差替・cancel）と unmount cleanup ──
  // 直前の imageObjectUrl を ref に保持し、変化（または null 化）したら revoke。
  // cells_loaded への遷移では同一 URL を引き継ぐため自動 revoke は発火しない（CEO 補正）。
  const prevObjectUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUrl = currentImageObjectUrl(state);
    const prevUrl = prevObjectUrlRef.current;
    if (prevUrl && prevUrl !== currentUrl) {
      URL.revokeObjectURL(prevUrl);
    }
    prevObjectUrlRef.current = currentUrl;
  }, [state]);

  useEffect(() => {
    // unmount 時の最終 revoke（image_loaded / row_selected / cells_loaded のどれで終わっても確実に解放）
    return () => {
      const url = prevObjectUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
        prevObjectUrlRef.current = null;
      }
    };
  }, []);

  // ── handlers ──
  const handleSelectFile = useCallback(
    async (file: File) => {
      try {
        const { imageObjectUrl, imageMeta } = await loadImageMetadata(file);
        const action: DevShiftDraftAction = {
          type: "image_loaded",
          imageObjectUrl,
          imageMeta,
        };
        dispatch(action);
      } catch {
        // 8-c-2 では error 状態への遷移 action を追加しない（type 上は存在するが unreachable のまま）。
        // 8-c-3 で extract 失敗時の error 経路と合わせて設計。本コミットでは silent fallback（state 不変）。
      }
    },
    []
  );

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void handleSelectFile(file);
      // 同じファイルを連続で選んだ場合も change を発火させる
      e.target.value = "";
    },
    [handleSelectFile]
  );

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onRowConfirm = useCallback((selection: AssistedRowSelection) => {
    dispatch({ type: "row_selected", selection });
  }, []);

  const onRowChange = useCallback((selection: AssistedRowSelection) => {
    dispatch({ type: "row_selected", selection });
  }, []);

  const onCancel = useCallback(() => {
    dispatch({ type: "cancel" });
  }, []);

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

        {(state.kind === "image_loaded" || state.kind === "row_selected") && (
          <div
            data-testid="dev-shift-draft-row-select"
            className="space-y-2"
          >
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
              <p
                data-testid="dev-shift-draft-next-stage-placeholder"
                className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500"
              >
                次の段階で、選択した帯から下書きを取り出します。
              </p>
            )}
          </div>
        )}

        {/* 8-c-3 以降で到達する状態（本コミットでは action 経路なし＝unreachable）。
            TypeScript exhaustive narrowing 維持のため明示。 */}
        {state.kind === "extracting" && (
          <div
            data-testid="dev-shift-draft-extracting-placeholder"
            className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500"
          >
            下書きを取り出しています…
          </div>
        )}
        {state.kind === "cells_loaded" && (
          <div
            data-testid="dev-shift-draft-cells-loaded-placeholder"
            className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] text-slate-500"
          >
            下書きの確認段は次の段階で接続します。
          </div>
        )}
        {state.kind === "error" && (
          <div
            data-testid="dev-shift-draft-error-placeholder"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] leading-relaxed text-rose-700"
          >
            {state.message}
          </div>
        )}
      </div>
    </div>
  );
}
