/**
 * locationAnchorFactory — OP-3B (CEO 2026-05-05)
 *
 * caller (= legacyAdapter / route) が `resolveHomeAnchor()` を呼んだ後の
 * `HomeAnchor | null` を input として受け、 `set_journey_origin` /
 * `set_journey_end` candidate envelope に wrap する **pure factory**。
 *
 * 設計原則 (CEO 2026-05-05 規律):
 *   - factory 内で **resolveHomeAnchor / location resolve / fetch / async I/O を一切呼ばない**
 *   - caller が取得済の HomeAnchor を input 経由で受ける
 *   - 既存 helper (= toOriginState、 pure) で JourneyAnchorState に変換
 *   - 1 anchor から 2 envelope (= origin / end の round-trip default) を出す
 *
 * priority / confidence (= OP-1 § 4.2 / § 4.3):
 *   - origin: priority 100、 confidence low (= location 由来 last resort)
 *   - end:    priority 100、 confidence low (= round-trip default last resort)
 *   - source: code_location
 *   - provenance: inferred (= location service 推論)
 *
 * OP-3B 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は pure function (= 副作用なし、 input mutate しない)
 *   - 既存 transportContext.ts は touch しない (= toOriginState を import で再利用)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 */

import type { HomeAnchor } from "../../planning/transportContext";
import type { Provenance } from "../eventSchema";
import { toOriginState } from "../../journey/anchorState";
import type {
  SetJourneyOriginOperationCandidate,
  SetJourneyEndOperationCandidate,
} from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LocationAnchorInput {
  /**
   * caller が `resolveHomeAnchor()` を呼んだ後の値。
   * null なら factory は空配列を返す (= location 不在で operation 出さない)。
   */
  homeAnchor: HomeAnchor | null;

  /** 抽出 turn (= trace 用) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defensive provenance default (= location 由来は inferred)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LOCATION_PROVENANCE: Provenance = {
  source_type: "inferred",
  source_span: [],
  provenance_confidence: "low",
  from_utterance: false,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `homeAnchor` から `set_journey_origin` + `set_journey_end` candidate を生成する。
 *
 * 動作:
 *   - homeAnchor が null → 空配列
 *   - homeAnchor あり → 2 envelope (= origin + round-trip default end)
 *
 * 既存挙動踏襲:
 *   - toOriginState で JourneyAnchorState に変換 (= source mapping は既存規律)
 *   - end は round-trip default として **同 anchor を end label に流す** (= 既存
 *     resolveJourneyEndAnchor の round-trip default 挙動を踏襲)
 *
 * @param input HomeAnchor + 抽出 turn
 * @returns 0 or 2 件の envelope (= origin + end、 配列)
 */
export function locationAnchorFactory(
  input: LocationAnchorInput,
): OperationEnvelope<
  SetJourneyOriginOperationCandidate | SetJourneyEndOperationCandidate
>[] {
  if (!input.homeAnchor) {
    return [];
  }

  const trace = input.sourceTurnIndex !== undefined
    ? { sourceTurnIndex: input.sourceTurnIndex, ruleId: "locationAnchor" }
    : { ruleId: "locationAnchor" };

  // origin envelope (= toOriginState で変換)
  const originAnchor = toOriginState(input.homeAnchor, "no_baseline");
  const originEnvelope = wrapOperation(
    {
      type: "set_journey_origin" as const,
      payload: originAnchor,
    },
    {
      source: "code_location",
      priority: 100,
      confidence: "low",
      provenance: LOCATION_PROVENANCE,
      trace,
    },
  );

  // end envelope (= round-trip default、 同 anchor を end label に流す)
  // 既存 resolveJourneyEndAnchor の round-trip default 挙動を踏襲:
  //   homeAnchor の lat/lng/label を JourneyEndAnchor に流し、 source =
  //   "default_round_trip" として表現する。
  const endEnvelope = wrapOperation(
    {
      type: "set_journey_end" as const,
      payload: {
        kind: "known_exact" as const,
        label: input.homeAnchor.label,
        lat: input.homeAnchor.lat,
        lng: input.homeAnchor.lng,
        source: "default_round_trip" as const,
      },
    },
    {
      source: "code_location",
      priority: 100,
      confidence: "low",
      provenance: LOCATION_PROVENANCE,
      trace,
    },
  );

  return [originEnvelope, endEnvelope];
}
