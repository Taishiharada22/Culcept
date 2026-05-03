/**
 * applyPlaceSelectionByTarget — B-3c-1 Commit 2
 *
 * CEO/GPT 2026-05-03 B-3c-1 設計提案 §5 Commit 2 (= GPT 2nd 補正反映済):
 *   selection route で target.kind に応じた処理を **完全 dispatch** する。
 *
 * 責務分離:
 *   - 本 helper: target.kind を見て applyPlaceSelection (event_where) /
 *     promoteJourneyOrigin (journey_origin) を呼び分け、結果を返す (= pure)
 *   - selection route: 戻り値の kind に応じて reducer dispatch / plan rebuild /
 *     reject response / activePresentation 制御
 *
 * GPT 2nd 補正の核心:
 *   journey_origin で promoteJourneyOrigin が blocked を返した場合、本 helper も
 *   `blocked_journey_origin` を返す。selection route はこれを見て:
 *     - dialogReducer を dispatch しない (= activePresentation clear しない)
 *     - reject response 返却 (= accepted=false, reason)
 *
 * scope (B-3c-1):
 *   - target.kind === "event_where" → 既存 applyPlaceSelection wrap (= 完全不変)
 *   - target.kind === "journey_origin" → promoteJourneyOrigin 呼び出し
 *   - target.kind === "journey_end" → rejected (= B-3e で実装、本 PR scope 外)
 *
 * 不変条件:
 *   - exhaustive switch (= TS never assertion で型安全)
 *   - event_where path は applyPlaceSelection の戻り値を そのまま返す (= byte-diff zero)
 *   - 全 path で入力 mutate しない (= pure)
 */

import type { Event } from "../comprehension/eventSchema";
import type { NormalizedPlaceCandidate } from "../search/normalizedPlace";
import type { PresentationTarget } from "./types";
import { applyPlaceSelection } from "../search/applyPlaceSelection";
import {
  promoteJourneyOrigin,
  type JourneyOriginPromotionBlockReason,
} from "./journeyOriginPromotion";
import type { JourneyAnchorState } from "../journey/anchorState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * dispatch helper の入力。route.ts (selection) が prevActive / morningSession から構築。
 *
 * - target: prevActive.target (= activePresentation の target)。target 未指定 (legacy)
 *   は本 helper を呼ばずに既存 event_where path で処理する想定 (= caller 責務)。
 * - currentJourneyOrigin: target.kind === "journey_origin" の時だけ参照される。
 *   morningSession.plan?.journeyOrigin を渡す。
 */
export interface ApplyPlaceSelectionByTargetInput {
  target: PresentationTarget;
  candidate: NormalizedPlaceCandidate;
  /** target.kind === "event_where" の時に必須。journey_origin 経路では使わない。 */
  events: Event[];
  /** target.kind === "event_where" の時に必須。journey_origin 経路では使わない。 */
  targetEventId: string;
  /** target.kind === "journey_origin" の時に必須。event_where 経路では使わない。 */
  currentJourneyOrigin?: JourneyAnchorState;
}

/**
 * dispatch 結果 (= discriminated union)。
 *
 * caller (= selection route) はこの kind を見て:
 *   - applied_event_where → 既存 flow (= reducer dispatch + events 反映 + plan rebuild)
 *   - applied_journey_origin → reducer dispatch + plan.journeyOrigin 更新 + plan rebuild
 *     (events は **更新しない**、必須 #4)
 *   - blocked_journey_origin → reject (= activePresentation clear しない、半壊 UX 防止)
 *   - rejected_target_kind → reject (= journey_end は B-3e 未実装、必須 #3)
 */
export type ApplyPlaceSelectionByTargetResult =
  | {
      kind: "applied_event_where";
      /** applyPlaceSelection の戻り値を そのまま転載 */
      events: Event[];
      applied: boolean;
      candidate: NormalizedPlaceCandidate;
    }
  | {
      kind: "applied_journey_origin";
      /** promoteJourneyOrigin が生成した known_exact state */
      promotedJourneyOrigin: JourneyAnchorState & { kind: "known_exact" };
      candidate: NormalizedPlaceCandidate;
    }
  | {
      kind: "blocked_journey_origin";
      /** promoteJourneyOrigin が返した blocked reason */
      reason: JourneyOriginPromotionBlockReason;
      candidate: NormalizedPlaceCandidate;
    }
  | {
      kind: "rejected_target_kind";
      /** B-3c-1 では journey_end のみ。将来 unknown target.kind が来た場合も対象。 */
      targetKind: PresentationTarget["kind"];
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dispatch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * target.kind 別 dispatch (= pure)。
 *
 * exhaustive switch で全 PresentationTarget kind を網羅。`never` assertion で
 * 型レベル exhaustive 保証 (= 将来 PresentationTarget に kind 追加された時に
 * compile error で気づく)。
 *
 * 副作用なし (= cache write / log / dispatch は caller 責務)。
 */
export function applyPlaceSelectionByTarget(
  input: ApplyPlaceSelectionByTargetInput,
): ApplyPlaceSelectionByTargetResult {
  const { target, candidate } = input;

  switch (target.kind) {
    case "event_where": {
      // 既存 path: applyPlaceSelection を wrap (= byte-diff zero、必須 #5)
      const result = applyPlaceSelection({
        events: input.events,
        targetEventId: input.targetEventId,
        candidate,
      });
      return {
        kind: "applied_event_where",
        events: result.events,
        applied: result.applied,
        candidate,
      };
    }

    case "journey_origin": {
      // 新 path: promoteJourneyOrigin を呼び、結果を pass through (= GPT 2nd 補正対応)
      const promotion = promoteJourneyOrigin(
        input.currentJourneyOrigin,
        candidate,
      );
      if (promotion.kind === "blocked") {
        return {
          kind: "blocked_journey_origin",
          reason: promotion.reason,
          candidate,
        };
      }
      return {
        kind: "applied_journey_origin",
        promotedJourneyOrigin: promotion.state,
        candidate,
      };
    }

    case "journey_end": {
      // B-3e で実装。B-3c-1 では明示 reject (= 必須 #3)
      return {
        kind: "rejected_target_kind",
        targetKind: "journey_end",
      };
    }

    default: {
      // exhaustive 保証: 将来 PresentationTarget に kind 追加された場合、
      // ここで compile error → 設計者が判断を強制される。
      const _exhaustive: never = target;
      void _exhaustive;
      return {
        kind: "rejected_target_kind",
        targetKind: (target as { kind: PresentationTarget["kind"] }).kind,
      };
    }
  }
}
