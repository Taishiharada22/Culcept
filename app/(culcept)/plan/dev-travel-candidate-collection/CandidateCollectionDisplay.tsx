/**
 * D4 — Candidate Collection Display（**read-only presentational・dev preview 専用**）
 *
 * 役割: `DisplayCandidateCollection` を **表示するだけ**の read-only コンポーネント。
 *   - accepts `DisplayCandidateCollection` **のみ**（CandidateCollectionDraft / serverOnly payload を受けない＝型）。
 *   - **action button / booking / schedule / execute / send / 入力 / 外部 link を一切持たない**（display only）。
 *   - ★ **rank 番号 / おすすめ badge / `ranked:false` machine text を出さない**。順番は自然文で「おすすめ順位でない」と明示。
 *   - place.externalId は **href にしない**（inert）。
 *   - interactivity 無し → "use client" なし・server render 可。
 */

import type { DisplayCandidateCollection, DisplayCandidateCard } from "@/lib/shared/travel/candidate-collection-display-types";
import type { DisplayDay, DisplayNode } from "@/lib/shared/travel/scheduled-draft-display-types";

function NodeRow({ node }: { node: DisplayNode }) {
  return (
    <li className="rounded-md border border-gray-200 bg-white/60 p-1.5" data-testid="candidate-node">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-gray-900">
          {node.startLabel}–{node.endLabel}
        </span>
        <span className="text-[10px] text-gray-400">{node.activityKind}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-gray-800">{node.place.label ?? "（場所未設定）"}</div>
    </li>
  );
}

function DayBlock({ day }: { day: DisplayDay }) {
  return (
    <section className="space-y-1" data-testid="candidate-day">
      <h4 className="text-[10px] font-bold tracking-wide text-gray-500">
        Day {day.dayIndex + 1} ・ {day.date}
      </h4>
      <ul className="space-y-1">
        {day.nodes.map((n) => (
          <NodeRow key={n.nodeId} node={n} />
        ))}
      </ul>
    </section>
  );
}

function Card({ card }: { card: DisplayCandidateCard }) {
  return (
    <article className="space-y-2 rounded-xl border border-gray-200 bg-white/50 p-3" data-testid="candidate-card">
      <header>
        <h3 className="text-[15px] font-bold text-gray-900">{card.title}</h3>
        <p className="mt-0.5 text-[11px] text-gray-500">{card.tags.map((t) => `#${t}`).join(" ")}</p>
      </header>
      <p className="text-[12px] text-gray-700">{card.rationaleShared}</p>
      <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
        {card.uncertaintyLabel && <span>{card.uncertaintyLabel}</span>}
        {card.tradeoffSummary && (
          <span>
            費用感 ¥{card.tradeoffSummary.cost} ・ 移動 {card.tradeoffSummary.distance} ・ 負荷 {card.tradeoffSummary.fatigue}
          </span>
        )}
        {card.reversalNote && <span>{card.reversalNote}</span>}
      </div>
      <div className="space-y-1.5">
        {card.days.map((d) => (
          <DayBlock key={d.dayIndex} day={d} />
        ))}
      </div>
    </article>
  );
}

export function CandidateCollectionDisplay({ collection }: { collection: DisplayCandidateCollection }) {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-6" data-testid="candidate-collection-display">
      <header>
        <h1 className="text-lg font-bold text-gray-900">候補の下書き（read-only preview）</h1>
        <p className="mt-1 text-[11px] text-gray-400">順番はおすすめ順位ではありません。</p>
        <p className="text-[11px] text-gray-400">予約・確定・送信・実行は行いません。</p>
      </header>
      {collection.cards.map((c) => (
        <Card key={c.candidateId} card={c} />
      ))}
    </div>
  );
}
