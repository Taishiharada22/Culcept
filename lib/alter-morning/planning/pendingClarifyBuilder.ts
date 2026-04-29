/**
 * pendingClarifyBuilder — ClarifyRequest → PendingClarify 変換 pure helpers
 *
 * CEO 2026-04-29 hotfix:
 *   PR #41b-0 で legacyAdapter.ts ↔ planning/reconcileEffectiveEvents.ts の
 *   **循環参照** が混入し、production webpack build が 45 分 hang → timeout error。
 *   本 module に `buildPendingClarifyFromResolution` / `toPendingSlot` を抽出し、
 *   両側からこちらを参照するようにして循環を断ち切る。
 *
 *   循環参照 (修正前):
 *     legacyAdapter.ts → planning/reconcileEffectiveEvents.ts → legacyAdapter.ts
 *
 *   修正後:
 *     legacyAdapter.ts → planning/pendingClarifyBuilder.ts
 *     planning/reconcileEffectiveEvents.ts → planning/pendingClarifyBuilder.ts
 *
 * 設計原則:
 *   - **pure**: 副作用なし、env / flag を読まない
 *   - **single responsibility**: ClarifyRequest → PendingClarify の変換のみ
 *   - **no upward import**: 親 directory (legacyAdapter) を import しない
 */

import type { Event } from "../comprehension/eventSchema";
import type { ClarifyRequest } from "./gapResolver";
import type {
  PendingClarify,
  PendingClarifyScope,
  PendingSlot,
} from "../types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// toPendingSlot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ClarifyRequest.target_slot → PendingSlot へ正規化。
 * answerBinder は "when"/"where"/"what"/"transport"/"endpoint" のみ扱う。
 * "target_ref" は「どの予定のことか」なので answerBinder 対象外（null を返す）。
 */
export function toPendingSlot(
  target: ClarifyRequest["target_slot"],
): PendingSlot | null {
  switch (target) {
    case "when":
    case "where":
    case "what":
    case "transport":
    case "endpoint":
      return target;
    default:
      return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildPendingClarifyFromResolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * resolveGaps の primary_clarify と comprehension events から
 * PendingClarify を組み立てる。
 *
 * W3-PR-7 Commit 3 以降: primary_clarify.scope が付与されていれば最優先で使う
 * （gapResolver が events + idx から計算済み）。後方互換のため、scope が欠けて
 * いる場合のみ event から再計算する fallback を持つ。
 *
 * 対象 event が見つからない、もしくは target_slot が answerBinder 対象外の場合は null。
 */
export function buildPendingClarifyFromResolution(
  primaryClarify: ClarifyRequest | null,
  events: Event[],
  priorSemanticMissCount?: number,
): PendingClarify | null {
  if (!primaryClarify) return null;
  const slot = toPendingSlot(primaryClarify.target_slot);
  if (!slot) return null;

  const idx = events.findIndex((e) => e.event_id === primaryClarify.event_id);
  if (idx < 0) return null;

  // primary_clarify.scope が付いていればそれを使う（gapResolver が正本）
  let scope: PendingClarifyScope;
  if (primaryClarify.scope) {
    scope = {
      timeLabel: primaryClarify.scope.timeLabel,
      activityLabel: primaryClarify.scope.activityLabel,
      eventOrdinal: primaryClarify.scope.eventOrdinal,
    };
  } else {
    // fallback: events から自前で計算（W3-PR-7 Commit 2 以前の経路互換）
    const ev = events[idx];
    scope = {
      timeLabel:
        ev.when.startTime ??
        (ev.when.timeHint
          ? ({ morning: "朝", noon: "昼", afternoon: "午後", evening: "夜" } as const)[
              ev.when.timeHint
            ] ?? null
          : null),
      activityLabel: ev.what.activity || ev.what.activityCanonical || null,
      eventOrdinal: idx + 1,
    };
  }

  return {
    event_id: primaryClarify.event_id,
    slot,
    kind: primaryClarify.kind,
    scope,
    question: primaryClarify.question,
    askedAt: new Date().toISOString(),
    semanticMissCount: priorSemanticMissCount ?? 0,
  };
}
