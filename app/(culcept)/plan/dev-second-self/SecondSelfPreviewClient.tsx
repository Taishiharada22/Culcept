"use client";
/**
 * A1-7-34 Second Self Preview Client — M3 review 済 tendency を **非断定・観察・共同編集トーン** で表示（read-only）。
 *   **correction write しない**（「直す」は導線 copy + disabled button のみ・実 write は次 gate）。Alter/Home/Stargazer 本線なし。
 */
import type { SecondSelfCard, SecondSelfView } from "@/lib/plan/reality/learning/second-self-presenter";

function Card({ c }: { c: SecondSelfCard }) {
  return (
    <li className="rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3" data-testid="second-self-card">
      <div className="text-[13px] text-gray-800">{c.observation}</div>
      <div className="mt-1 text-[11px] text-gray-500">{c.certaintyNote}</div>
      {c.counterNote && <div className="mt-1 text-[11px] text-rose-500">{c.counterNote}</div>}
      {c.stillPossibleNote && <div className="mt-0.5 text-[11px] text-gray-500">{c.stillPossibleNote}</div>}
      <div className="mt-1 text-[10px] text-gray-400">{c.provenanceNote}</div>
      {c.correctionState && <div className="mt-1 text-[10px] text-violet-600">{c.correctionState}</div>}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-gray-500">{c.correctable}</span>
        {/* v1: 導線のみ・実 write しない（次 gate）。disabled で意図を明示。 */}
        <button type="button" disabled className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] text-gray-400" data-testid="correct-button-disabled">
          直す（準備中）
        </button>
      </div>
    </li>
  );
}

export function SecondSelfPreviewClient({ view, enabled }: { view: SecondSelfView; enabled: boolean }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800" data-testid="second-self">
      <h1 className="text-lg font-bold">第二の自己（観測・dev preview）</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-7-34・dev/staging 限定・<b>operator-only・read-only</b>。review された tendency が <b>人にどう見えるべきか</b>の検証面。
        <b>断定しない・観測・あなた自身が編集できる</b>トーン。本格的な user 公開・修正の書き込み・Alter 連結は<b>まだしません</b>。
      </p>
      {!enabled && <div className="mt-2 rounded-md bg-gray-100 px-3 py-2 text-[11px] text-gray-500" data-testid="disabled">REALITY_SECOND_SELF_SURFACE が OFF です（read 0）。</div>}
      {view.isEmpty ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-6 text-center text-[12px] text-gray-500" data-testid="empty">
          {view.emptyNote}
        </div>
      ) : (
        <ul className="mt-4 space-y-3" data-testid="second-self-list">
          {view.cards.map((c, i) => (
            <Card key={i} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
