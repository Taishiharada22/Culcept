/**
 * Phase 3-L-2 (pure) — UnresolvedProvider
 *
 * 役割:
 *   常に unresolved を返す sentinel provider。 caller 側で「諦め」 を表現する
 *   構造的な provider として配線可能にする。
 *
 * 用途:
 *   - sensitive_both segment の処理 (= caller が直接呼ぶか、 cascade で fallback)
 *   - 全 provider down 時の最終 fallback
 *   - test fixture で「provider が失敗する」 シナリオを simulate
 *
 * 思想:
 *   - id "none" は MovementSegmentResolved.source として禁止 (= L-1 integrity contract)
 *   - 構造的に「resolved になり得ない」 ことを type system で保証
 *
 * L-2-pure scope:
 *   - state-less / side-effect-free
 *   - no API / no DB / no localStorage / no env
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-transport-design.md v0.2 §4.7
 *   - lib/plan/transport/transportTypes.ts
 */

import type {
  MovementResolutionInput,
  MovementResolutionResult,
  MovementUnresolvedReason,
  TransportResolutionProvider,
} from "./transportTypes";

/**
 * UnresolvedProvider factory。
 *
 * @param reason - 固定で返す unresolvedReason (= 「なぜ unresolved になるか」)
 *
 * Example:
 *   const noProvider = createUnresolvedProvider("no_provider_available");
 *   const result = await noProvider.resolveDuration({ privacyClass: "normal" });
 *   // result.ok === false, result.reason === "no_provider_available"
 */
export function createUnresolvedProvider(
  reason: MovementUnresolvedReason,
): TransportResolutionProvider {
  return {
    id: "none",
    health: "healthy",
    async resolveDuration(
      _input: MovementResolutionInput,
    ): Promise<MovementResolutionResult> {
      return { ok: false, reason };
    },
  };
}
