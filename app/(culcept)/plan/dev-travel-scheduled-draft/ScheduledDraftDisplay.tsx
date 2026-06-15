/**
 * PV1 — Scheduled-Draft Display（**read-only presentational・dev preview 専用**）
 *
 * 役割: `DisplayScheduledItinerary` を **表示するだけ**の read-only コンポーネント。
 *   - accepts `DisplayScheduledItinerary` **のみ**（bridge envelope / raw draft / provenance を受け取らない＝型）。
 *   - **action button / booking / schedule / execute / send / 入力 / 外部 link を一切持たない**（display only）。
 *   - executionAuthority / authoritative / serverOnly prop を持たない。
 *   - ★ place.externalId は **href にしない**（inert・external link は別 Tier1 gate）。
 *   - interactivity 無し → "use client" なし・server render 可。
 */

import type { DisplayScheduledItinerary, DisplayDay, DisplayNode } from "@/lib/shared/travel/scheduled-draft-display-types";

function NodeRow({ node }: { node: DisplayNode }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white/60 p-2" data-testid="scheduled-draft-node">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold text-gray-900">
          {node.startLabel}–{node.endLabel}
        </span>
        <span className="text-[11px] text-gray-400">{node.activityKind}</span>
      </div>
      <div className="mt-0.5 text-[13px] text-gray-800">{node.place.label ?? "（場所未設定）"}</div>
      <div className="mt-0.5 text-[11px] text-gray-500">
        予算 ¥{node.budgetBand.lo}–¥{node.budgetBand.hi} ・ 負荷 {node.fatigueLoad}/5 ・ {node.nodeConfidence}
      </div>
    </li>
  );
}

function DayBlock({ day }: { day: DisplayDay }) {
  return (
    <section className="space-y-1.5" data-testid="scheduled-draft-day">
      <h2 className="text-[11px] font-bold tracking-wide text-gray-500">
        Day {day.dayIndex + 1} ・ {day.date}
      </h2>
      <ul className="space-y-1.5">
        {day.nodes.map((n) => (
          <NodeRow key={n.nodeId} node={n} />
        ))}
      </ul>
      {day.transitions.length > 0 && (
        <ul className="space-y-1 pl-1" data-testid="scheduled-draft-transitions">
          {day.transitions.map((t) => (
            <li key={`${t.fromNodeId}>>${t.toNodeId}`} className="text-[11px] text-gray-400">
              移動 {t.transport} ・ {t.durationMin}分 ・ ¥{t.cost.lo}–¥{t.cost.hi}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScheduledDraftDisplay({ itinerary }: { itinerary: DisplayScheduledItinerary }) {
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-6" data-testid="scheduled-draft-display">
      <header>
        <h1 className="text-lg font-bold text-gray-900">旅程ドラフト（read-only preview）</h1>
        <p className="mt-1 text-[11px] text-gray-400">提案（draft_proposal）です。予約・確定・送信・実行は行いません。</p>
      </header>
      {itinerary.days.map((d) => (
        <DayBlock key={d.dayIndex} day={d} />
      ))}
    </div>
  );
}
