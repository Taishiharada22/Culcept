/**
 * Phase 3-L-2 (pure) — ManualUserProvider (= shell only)
 *
 * 役割:
 *   user が明示した duration を resolved として返す provider。
 *   将来 (= L-3+) で localStorage / DB に user override を永続化する。
 *
 * **L-2-pure 段階での明示制約 (= 2026-05-22 CEO PARTIAL 承認)**:
 *   - **localStorage 不使用** (= L-3+ で実装)
 *   - **DB 不使用** (= L-3+ で実装)
 *   - **state-less shell** — input で直接 duration を渡してもらい、 そのまま resolved を返すだけ
 *   - 学習機能なし (= 「同じ from/to で次回も自動適用」 等は L-3+)
 *
 * 思想:
 *   - user が「これは 15 分で歩ける」 と明示した値を `user_explicit` confidence で resolved 化
 *   - distance heuristic より優先される (= L-3+ cascade で実装)
 *   - L-2 段階では「provider interface が type-correct に動く」 ことの証明のみ
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-transport-design.md v0.2 §4.7 / §5.4 (= User Override 永続化は L-3+)
 *   - lib/plan/transport/transportTypes.ts
 */

import type {
  MovementResolutionInput,
  MovementResolutionResult,
  MovementSegmentResolved,
  TransportMode,
  TransportResolutionProvider,
} from "./transportTypes";
import { assertMovementSegmentCompliance } from "./transportIntegrityContract";

/**
 * ManualUserProvider の resolve 入力拡張。
 *
 * heuristic provider と同様、 base segment 情報と user 明示値を渡す。
 */
export interface ManualUserResolveInput extends MovementResolutionInput {
  /** segment base — caller が MovementTransition 由来 field を渡す */
  readonly segmentBase: {
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly fromLocationText?: string;
    readonly toLocationText?: string;
    readonly sensitiveProximity: boolean;
  };
  /** user 明示の duration (分)。 finite + non-negative */
  readonly userDurationMin: number;
  /** user 明示の mode。 省略時は "unknown" */
  readonly userMode?: TransportMode;
}

/**
 * ManualUserProvider factory。
 *
 * 挙動:
 *   1. privacy guard (= sensitive_both / location_unknown → unresolved)
 *   2. segmentBase / userDurationMin が無ければ no_provider_available
 *   3. userDurationMin が invalid (= NaN / negative / non-finite) なら heuristic_failed 同等
 *   4. resolved segment 構築 (= confidence high / user_explicit)
 *
 * Shell only 注記:
 *   - localStorage への保存処理は本 file に含まない
 *   - localStorage からの読み込み処理も含まない
 *   - 「同じ from/to で次回再利用」 機能なし
 *   - これらは全て L-3+ で実装する (= CEO 2026-05-22 PARTIAL 採用)
 */
export function createManualUserProvider(): TransportResolutionProvider {
  return {
    id: "manual_user",
    health: "healthy",
    async resolveDuration(
      input: MovementResolutionInput,
    ): Promise<MovementResolutionResult> {
      // 1. Privacy guard
      if (input.privacyClass === "sensitive_both") {
        return { ok: false, reason: "sensitive_proximity" };
      }
      if (input.privacyClass === "location_unknown") {
        return { ok: false, reason: "location_unknown" };
      }

      // 2/3. Narrow + validate user input
      const manualInput = input as ManualUserResolveInput;
      const base = manualInput.segmentBase;
      const userDuration = manualInput.userDurationMin;

      if (!base) {
        return { ok: false, reason: "no_provider_available" };
      }
      if (
        typeof userDuration !== "number" ||
        !Number.isFinite(userDuration) ||
        userDuration < 0
      ) {
        return { ok: false, reason: "no_provider_available" };
      }

      // 4. Build resolved segment
      const userMode: TransportMode = manualInput.userMode ?? "unknown";

      const segment: MovementSegmentResolved = {
        fromNodeId: base.fromNodeId,
        toNodeId: base.toNodeId,
        fromLocationText: base.fromLocationText,
        toLocationText: base.toLocationText,
        sensitiveProximity: base.sensitiveProximity,
        timingStatus: "resolved",
        estimatedDurationMin: userDuration,
        modeCandidate: {
          mode: userMode,
          confidence: {
            level: "high",
            reason: "user_explicit",
          },
        },
        source: "manual_user",
        confidence: {
          level: "high",
          reason: "user_explicit",
        },
        privacyClass: input.privacyClass,
      };

      assertMovementSegmentCompliance(segment);
      return { ok: true, segment };
    },
  };
}
