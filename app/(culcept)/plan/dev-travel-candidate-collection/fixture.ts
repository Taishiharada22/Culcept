/**
 * D4 — Candidate Collection dev preview fixture（**fixture のみ・real data なし・runtime 非実行**）
 *
 * 設計: docs/t11-candidate-collection-display-preview-preflight.md §7
 *
 * 目的: projectDisplayCandidateCollection の表示 UX を目視確認するための **手組み CandidateCollectionDraft**。
 *   runtime/DB/API/外部を一切呼ばない。
 *
 * 厳守: real user data なし・fetch/API/DB/Supabase なし・engine 非実行・外部 Maps なし・booking/送信なし。
 *   rationale.forParticipant（private）は **表示されないことの確認用**に意図的に入れてある。
 */

import type { CandidateCollectionDraft } from "@/lib/shared/travel/candidate-collection-draft-types";
import type { TravelCandidate } from "@/lib/shared/travel/core-types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });

const onsenCandidate: TravelCandidate = {
  candidateId: "candidate:relaxed",
  title: "温泉でととのう休日",
  tags: ["relax", "onsen"],
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:onsen", startMin: 600, endMin: 690, place: { placeRefId: "onsen", externalId: "place_demo_onsen", label: "渓谷の露天温泉" }, activityKind: "onsen", budgetBand: yen(1500, 2500), fatigueLoad: 2, nodeConfidence: "anchor" },
          { nodeId: "n:lunch", startMin: 720, endMin: 780, place: { placeRefId: "lunch", label: "蕎麦処" }, activityKind: "meal", budgetBand: yen(2000, 4000), fatigueLoad: 1, nodeConfidence: "anchor" },
        ],
        edges: [{ fromNodeId: "n:onsen", toNodeId: "n:lunch", transport: "walk", durationMin: 15, cost: yen(0, 0) }],
      },
    ],
  },
  tradeoff: { cost: 4500, distance: 12, fatigue: 3, experienceVariety: 2 },
  constraints: [],
  // ★ shared は表示・forParticipant（private）は表示されないことの確認用
  rationale: { shared: "静かな環境で疲れを抜く一日。移動は少なめ。", forParticipant: { p1: "PRIVATE_本人向けの理由（表示してはいけない）" } },
  uncertainty: "medium",
  reversal: { cancellable: true },
};

const walkCandidate: TravelCandidate = {
  candidateId: "candidate:active",
  title: "渓谷さんぽと地のもの",
  tags: ["walk", "nature"],
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:trail", startMin: 540, endMin: 660, place: { placeRefId: "trail", label: "渓谷遊歩道" }, activityKind: "activity", budgetBand: yen(0, 0), fatigueLoad: 3, nodeConfidence: "anchor" },
        ],
        edges: [],
      },
    ],
  },
  tradeoff: { cost: 2000, distance: 18, fatigue: 4, experienceVariety: 3 },
  constraints: [],
  rationale: { shared: "体を動かしたい日向け。自然の中を歩く。", forParticipant: { p1: "PRIVATE_本人向けの理由（表示してはいけない）" } },
  uncertainty: "high",
};

/**
 * 第 3 候補（onsenCandidate に明確に支配される＝dominance note の dominated kind を実証用）。
 * tradeoff: 全軸で onsen と同等 or 悪い（cost↑ distance↑ fatigue↑ experienceVariety↓）。
 */
const expensiveCandidate: TravelCandidate = {
  candidateId: "candidate:expensive",
  title: "観光バスで巡る一日",
  tags: ["sightseeing"],
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:bus", startMin: 540, endMin: 720, place: { placeRefId: "bus", label: "観光バス" }, activityKind: "sightseeing", budgetBand: yen(7000, 9000), fatigueLoad: 4, nodeConfidence: "anchor" },
        ],
        edges: [],
      },
    ],
  },
  // onsen より全軸悪い: cost 9000>4500, distance 20>12, fatigue 4>3, variety 1<2 → onsen dominates expensive
  tradeoff: { cost: 9000, distance: 20, fatigue: 4, experienceVariety: 1 },
  constraints: [],
  rationale: { shared: "観光地を効率よく回る一日。", forParticipant: { p1: "PRIVATE_本人向けの理由（表示してはいけない）" } },
  uncertainty: "low",
};

/** ★ server-only 保管ドラフト（page が projectDisplayCandidateCollection で client-safe 投影する） */
export const FIXTURE_COLLECTION_DRAFT: CandidateCollectionDraft = {
  outcome: "candidate_collection_draft",
  serverOnly: true,
  authoritative: false,
  ranked: false,
  // onsen + walk は trade-off で互いに frontier、expensive は onsen に支配される dominated 候補
  candidates: [onsenCandidate, walkCandidate, expensiveCandidate],
};
