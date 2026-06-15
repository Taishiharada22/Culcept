/**
 * PV1 — Scheduled-Draft dev preview fixture（**fixture のみ・real data なし・engine 非実行**）
 *
 * 設計: docs/t11-pipeline-closeout-display-preview-preflight.md §6
 *
 * 目的: display projection（projectDisplayScheduledItinerary）の表示 UX を目視確認するための、
 *   **手組み server-only bridge envelope**。runtime/DB/API/外部を一切呼ばない。
 *
 * 厳守: real user data なし・fetch/API/DB/Supabase なし・runTravelPlanEngine 非実行・外部 Maps なし・
 *   booking/送信なし。externalId は inert metadata（href にしない）。
 */

import type { AssemblyBridgeResult } from "@/lib/shared/travel/solver-assembly-bridge-types";
import type { ScheduledTravelItineraryDraft } from "@/lib/shared/travel/assembly-types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });

/** 手組み 1 日 2 node（温泉 → 昼食）の scheduled draft（authoritative:false / draft:true） */
const FIXTURE_DRAFT: ScheduledTravelItineraryDraft = {
  outcome: "scheduled_draft",
  authoritative: false,
  draft: true,
  candidateId: "candidate:demo-relaxed",
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          {
            nodeId: "node:onsen:onsen",
            startMin: 600, // 10:00
            endMin: 690, // 11:30
            place: { placeRefId: "onsen", externalId: "place_demo_onsen", label: "渓谷の露天温泉" },
            activityKind: "onsen",
            budgetBand: yen(1500, 2500),
            fatigueLoad: 2,
            nodeConfidence: "anchor",
          },
          {
            nodeId: "node:lunch:meal",
            startMin: 720, // 12:00
            endMin: 780, // 13:00
            place: { placeRefId: "lunch", externalId: "place_demo_soba", label: "蕎麦処" },
            activityKind: "meal",
            budgetBand: yen(2000, 4000),
            fatigueLoad: 1,
            nodeConfidence: "anchor",
          },
        ],
        edges: [
          {
            fromNodeId: "node:onsen:onsen",
            toNodeId: "node:lunch:meal",
            transport: "walk",
            durationMin: 15,
            cost: yen(0, 0),
          },
        ],
      },
    ],
  },
  provenance: { nodeBudget: {}, edgeTransport: {}, edgeCost: {}, dayIndexSource: "single_day_zero" },
};

/** ★ server-only bridge envelope（page が projectDisplayScheduledItinerary で display 投影する） */
export const FIXTURE_BRIDGE_RESULT: AssemblyBridgeResult = { outcome: "scheduled_draft", serverOnly: true, draft: FIXTURE_DRAFT };
