/**
 * DP2 — Scheduled-Draft Display Projection helper（**pure・未配線**）
 *
 * 設計正本: docs/t11-pipeline-closeout-display-preview-preflight.md §4/§5（+ CEO 補正: externalId は inert）
 *
 * 役割: server-only `AssemblyBridgeResult`(scheduled_draft) を **client 表示用 `DisplayScheduledItinerary`** に写す。
 *   read-only copy + 決定論 "HH:MM" フォーマットのみ。
 *
 * 厳守:
 *   - `outcome !== "scheduled_draft"` → `null`（表示なし）。`bridge.draft.itinerary` のみから copy。
 *   - **serverOnly marker / ScheduledDraftProvenance(audit) / authoritative・draft 内部 flag / 内部 placeRefId を出力に含めない**。
 *   - solve/reorder/repair/推論しない・external lookup なし・Maps link 生成なし・booking/action 生成なし。
 *   - place.externalId は carry のみ（inert・href にしない）。
 */

import type { AssemblyBridgeResult } from "./solver-assembly-bridge-types";
import type { TravelItinerary } from "./core-types";
import type { DisplayDay, DisplayNode, DisplayScheduledItinerary, DisplayTransition } from "./scheduled-draft-display-types";

/** explicit minutes → 決定論 "HH:MM"（捏造でなく表示フォーマット） */
function hhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * TravelItinerary → client-safe `DisplayDay[]`（read-only copy + 決定論 "HH:MM"）。
 *   ★ 内部 placeRefId を出さない・externalId は inert carry のみ・solve/reorder/推論しない。
 *   scheduled-draft / candidate collection の双方が再利用する単一正本。
 */
export function projectDisplayDays(itinerary: TravelItinerary): DisplayDay[] {
  return itinerary.days.map((day) => ({
    dayIndex: day.dayIndex,
    date: day.date,
    nodes: day.nodes.map(
      (n): DisplayNode => ({
        nodeId: n.nodeId,
        startMin: n.startMin,
        endMin: n.endMin,
        startLabel: hhmm(n.startMin),
        endLabel: hhmm(n.endMin),
        // ★ 内部 placeRefId は出さない・externalId は inert metadata として carry のみ
        place: {
          ...(n.place.label !== undefined ? { label: n.place.label } : {}),
          ...(n.place.externalId !== undefined ? { externalId: n.place.externalId } : {}),
        },
        activityKind: n.activityKind,
        budgetBand: n.budgetBand,
        fatigueLoad: n.fatigueLoad,
        nodeConfidence: n.nodeConfidence,
      }),
    ),
    transitions: day.edges.map(
      (e): DisplayTransition => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, transport: e.transport, durationMin: e.durationMin, cost: e.cost }),
    ),
  }));
}

export function projectDisplayScheduledItinerary(bridge: AssemblyBridgeResult): DisplayScheduledItinerary | null {
  if (bridge.outcome !== "scheduled_draft") return null; // no_draft → 表示なし
  const draft = bridge.draft;
  // ★ serverOnly / provenance(audit) / authoritative / draft 内部 flag を出力に含めない（新規 display payload を構築）
  return { status: "draft_proposal", candidateId: draft.candidateId, days: projectDisplayDays(draft.itinerary) };
}
