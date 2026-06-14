/**
 * T11-B(CoAlter) — CoAlter Cues Preview（**read-only presentational・dev preview 専用**）
 *
 * 役割: `CoAlterProjectionCue[]` を **表示するだけ** の read-only コンポーネント。
 *   - accepts `CoAlterProjectionCue[]` **のみ**（authoritative packet / raw FitResult を受け取らない＝型）。
 *   - **action button / booking / schedule / execute / send / 入力 を一切持たない**（display only）。
 *   - executionAuthority / authoritative / diagnostics prop を持たない。
 *   - interactivity 無し → client component 不要（"use client" なし・server render 可）。
 */

import type { CoAlterProjectionCue, CoAlterProjectionDisplayAction } from "@/lib/shared/travel/coalter-projection-consume-types";

/** action → 日本語表示ラベル（実行ではなく「候補/説明」であることを明示）。 */
const ACTION_LABEL: Record<CoAlterProjectionDisplayAction, string> = {
  ask_question: "質問候補",
  ask_confirmation: "確認候補",
  explain_plan: "説明",
  note_risk: "注意",
  show_fallback: "代替案",
};

export function CoAlterCuesPreview({ cues, title = "CoAlter Cues（read-only preview）" }: { cues: CoAlterProjectionCue[]; title?: string }) {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-6" data-testid="coalter-cues-preview">
      <header>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-[11px] text-gray-400">
          CoAlter が提示する「候補・説明」の表示のみ。実行・予約・確定・送信は行いません。
        </p>
      </header>

      {cues.length === 0 ? (
        <p className="text-[13px] text-gray-400" data-testid="coalter-cues-empty">表示できる cue がありません。</p>
      ) : (
        <ul className="space-y-2">
          {cues.map((c, i) => (
            <li key={i} className="rounded-xl border border-gray-200 bg-white/60 p-3" data-testid={`cue-${c.action}`}>
              <div className="text-[11px] font-bold tracking-wide text-gray-500">{ACTION_LABEL[c.action]}</div>
              <div className="mt-1 text-[13px] text-gray-800">{c.ref}</div>
              <div className="mt-0.5 text-[10px] text-gray-400">由来: {c.source}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
