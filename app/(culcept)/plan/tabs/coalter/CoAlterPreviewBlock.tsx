"use client";

/**
 * C5-E: CoAlter 非永続 preview の表示ブロック（**presentational・testable**）
 *
 * CoAlterTab から抽出（挙動不変）。`enabled`(client flag) OFF → null。ON → on-demand 生成ボタン + 状態別表示。
 * **保存しない**・absolute 配置（split layout 非干渉）・raw 内部 signal は出さない（previewText のみ）。
 */

import type { CoAlterBrainPreview } from "@/lib/coalter/preview/brainPreviewCore";
import type { UseCoAlterPreviewResult } from "@/app/(culcept)/plan/coalter-runtime/useCoAlterPreview";

export interface CoAlterPreviewBlockProps {
  /** client UI gate（`coalterBrainPreviewClient`）。false → 何も描画しない。 */
  readonly enabled: boolean;
  readonly state: UseCoAlterPreviewResult["state"];
  readonly preview: CoAlterBrainPreview | null;
  readonly onGenerate: () => void;
}

export function CoAlterPreviewBlock({ enabled, state, preview, onGenerate }: CoAlterPreviewBlockProps) {
  if (!enabled) return null;
  return (
    <div
      className="absolute right-2 top-2 z-10 max-w-[62%] rounded-lg border border-violet-200 bg-white/90 p-2 text-[11px] shadow-md"
      data-testid="coalter-brain-preview-block"
    >
      <button
        type="button"
        onClick={onGenerate}
        className="font-bold text-violet-700"
        data-testid="coalter-preview-generate"
      >
        CoAlter プレビュー生成
      </button>
      {state === "loading" && <p className="text-gray-400">生成中…</p>}
      {state === "ready" && preview && (
        <p className="mt-1 text-gray-800" data-testid="coalter-preview-text">
          CoAlter: {preview.previewText}
        </p>
      )}
      {state === "insufficient" && <p className="mt-1 text-gray-400">（会話がまだ足りません）</p>}
      {state === "unavailable" && <p className="mt-1 text-gray-400">（preview を取得できません）</p>}
    </div>
  );
}
