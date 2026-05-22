/**
 * MovementTransition generator — Phase 3-K (= K-1c)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.5 / §6.3 / §22.3
 *
 * 役割:
 *   連続 EventNode 間の location 変化を MovementTransition として生成。
 *   3-K では時刻 / duration / mode 未確定 (= "unresolved")。
 *   3-L で MovementSegment に attribute 注入で昇格予定。
 *
 * 不変原則:
 *   - pure
 *   - sensitive 由来 (= EventNode.locationText が undefined) は transition 側も undefined
 *   - sensitiveProximity = 前後 EventNode のいずれか sensitive なら true
 *   - movement 判定は locationText のみ (= locationCategory 不使用、 v1.1 §22.3)
 *   - LLM 不使用
 */

import type { EventNode, MovementTransition } from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trigger logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 2 つの連続 EventNode 間に MovementTransition を emit するか。
 *
 * 規則 (= 設計 §6.3):
 *   - 両方 undefined or 等しい → false (= 移動なし)
 *   - 片方だけ undefined → true (= 不明、 安全側で「移動あり」)
 *   - 両方あって異なる → true (= 移動あり)
 *
 * 注意 (= 設計上の意図):
 *   - sensitive EventNode は locationText が undefined のため、
 *     sensitive → sensitive 連続は false 判定になる (= privacy 優先)
 *   - sensitive → non-sensitive または non-sensitive → sensitive は
 *     片方 undefined のため true (= 安全側)
 */
export function shouldEmitMovementTransition(
  prev: EventNode,
  next: EventNode,
): boolean {
  const prevLoc = prev.locationText;
  const nextLoc = next.locationText;
  if (prevLoc === nextLoc) return false;
  if (prevLoc === undefined || nextLoc === undefined) return true;
  return prevLoc !== nextLoc;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 EventNode 配列から MovementTransition 配列を生成。
 *
 * 規則:
 *   - eventNodes は startTime 昇順 sort 済 (= caller 責任)
 *   - 連続 pair で shouldEmitMovementTransition === true なら transition emit
 *   - sensitiveProximity = 前後の sensitive flag OR
 *   - sensitive proximity の場合、 fromLocationText / toLocationText は undefined
 *     (= redaction、 RedactionContract sensitiveTransitionLocationHidden)
 *   - timingStatus は常に "unresolved"
 */
export function buildMovementTransitions(
  eventNodes: ReadonlyArray<EventNode>,
): ReadonlyArray<MovementTransition> {
  if (eventNodes.length < 2) return [];

  const transitions: MovementTransition[] = [];
  for (let i = 0; i < eventNodes.length - 1; i++) {
    const prev = eventNodes[i]!;
    const next = eventNodes[i + 1]!;
    if (!shouldEmitMovementTransition(prev, next)) continue;

    const sensitiveProximity = prev.sensitive || next.sensitive;

    transitions.push({
      fromNodeId: prev.id,
      toNodeId: next.id,
      timingStatus: "unresolved",
      // sensitiveProximity なら location は undefined (= RedactionContract 準拠)
      // それ以外は EventNode.locationText (= 非 sensitive なら raw、 sensitive なら undefined)
      fromLocationText: sensitiveProximity ? undefined : prev.locationText,
      toLocationText: sensitiveProximity ? undefined : next.locationText,
      sensitiveProximity,
    });
  }

  return transitions;
}
