/**
 * B2-D4 — Candidate Comparison Memo Display（**read-only presentational・dev preview 専用**）
 *
 * 役割: `DisplayCandidateComparison` を **表示するだけ**の read-only コンポーネント。
 *   - accepts `DisplayCandidateComparison` **のみ**（overlay/collection を直接受けない＝型）。
 *   - **rank 番号 / score / 順位 badge / "Pareto"/"best"/"worst" を出さない**（自然文 disclaimer のみ）。
 *   - action button / booking / 入力 / 外部 link / href なし（display only）。
 *   - "use client" なし・server render 可。
 */

import type {
  DisplayCandidateComparison,
  DisplayCandidateDominanceNote,
} from "@/lib/shared/travel/candidate-comparison-display-types";

function NoteRow({ note }: { note: DisplayCandidateDominanceNote }) {
  return (
    <li className="rounded-md border border-gray-200 bg-white/50 p-2" data-testid="candidate-comparison-note">
      <p className="text-[12px] text-gray-800">{note.text}</p>
      {note.weakerAxes && note.weakerAxes.length > 0 && (
        <p className="mt-0.5 text-[10px] text-gray-500" data-testid="candidate-comparison-weaker-axes">
          劣る軸: {note.weakerAxes.join(" ・ ")}
        </p>
      )}
    </li>
  );
}

export function CandidateComparisonDisplay({ comparison }: { comparison: DisplayCandidateComparison }) {
  return (
    <div className="mx-auto max-w-md space-y-2 px-4 pb-6" data-testid="candidate-comparison-display">
      <header>
        <h2 className="text-[15px] font-bold text-gray-900">比較メモ（read-only preview）</h2>
        <p className="mt-1 text-[11px] text-gray-400">{comparison.orderDisclaimer}</p>
      </header>
      <ul className="space-y-1.5">
        {comparison.notes.map((n) => (
          <NoteRow key={n.candidateId} note={n} />
        ))}
      </ul>
    </div>
  );
}
