/**
 * Phase 3-L-1 (pure) — MovementSegment Integrity Contract
 *
 * 役割:
 *   MovementSegment が discriminated union として正しく構築されているかを
 *   runtime に機械保証する。 Provider 実装 / DayGraph 統合層で必ず通す関門。
 *
 * 8 不変条件 (= invariant):
 *   1. resolvedHasDuration:        resolved → estimatedDurationMin は finite number
 *   2. resolvedHasMode:             resolved → modeCandidate は存在
 *   3. resolvedHasSource:           resolved → source は "none" 以外
 *   4. resolvedHasConfidence:       resolved → confidence は存在
 *   5. unresolvedHasReason:         unresolved → unresolvedReason は valid literal
 *   6. sensitiveBothIsUnresolved:   privacy "sensitive_both" は resolved になれない
 *   7. providerNoneOnlyUnresolved:  source "none" は unresolved 専用
 *   8. locationUnknownIsUnresolved: privacy "location_unknown" は resolved になれない
 *
 * 思想:
 *   - Type system だけでは privacy / provider の cross-field 制約を全て表現できない
 *   - 「sensitive_both で resolved」 は型では成立するが、 思想として禁止
 *   - 機械保証で「型は通るが意味的に禁止」 を runtime で reject する
 *
 * L-1-pure scope:
 *   - assert function only。 UI / DB / API 一切呼ばない。
 *   - 利用箇所: L-2 provider tests、 L-3+ build pipeline
 *
 * 参照:
 *   - lib/plan/transport/transportTypes.ts
 *   - lib/plan/dayGraph/dayGraphRedactionContract.ts (= K phase の同 pattern)
 */

import type {
  MovementSegment,
  MovementSegmentResolved,
  MovementSegmentUnresolved,
  MovementUnresolvedReason,
  TransportProvider,
} from "./transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract 宣言 (= 不変条件の literal record)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 8 不変条件の宣言。 全 true (= literal type) で固定。
 *
 * 用途:
 *   - test snapshot で contract が改竄されていないことを検出
 *   - documentation として読まれる
 */
export interface TransportIntegrityContract {
  readonly resolvedHasDuration: true;
  readonly resolvedHasMode: true;
  readonly resolvedHasSource: true;
  readonly resolvedHasConfidence: true;
  readonly unresolvedHasReason: true;
  readonly sensitiveBothIsUnresolved: true;
  readonly providerNoneOnlyUnresolved: true;
  readonly locationUnknownIsUnresolved: true;
}

export const TRANSPORT_INTEGRITY_CONTRACT: TransportIntegrityContract = {
  resolvedHasDuration: true,
  resolvedHasMode: true,
  resolvedHasSource: true,
  resolvedHasConfidence: true,
  unresolvedHasReason: true,
  sensitiveBothIsUnresolved: true,
  providerNoneOnlyUnresolved: true,
  locationUnknownIsUnresolved: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error class (= 違反時に throw)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Contract 違反を表す Error。
 *
 * - violation: 違反した invariant key
 * - segment:    違反した segment (= debug 用、 PII redacted を期待)
 */
export class MovementSegmentIntegrityError extends Error {
  readonly violation: keyof TransportIntegrityContract;
  readonly segmentSnapshot: Readonly<MovementSegment>;

  constructor(
    violation: keyof TransportIntegrityContract,
    segment: MovementSegment,
    detail?: string,
  ) {
    const detailSuffix = detail ? ` (${detail})` : "";
    super(
      `[L-1] MovementSegment violates ${violation}${detailSuffix}. ` +
        `timingStatus=${segment.timingStatus}.`,
    );
    this.name = "MovementSegmentIntegrityError";
    this.violation = violation;
    this.segmentSnapshot = segment;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 invariant checker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_UNRESOLVED_REASONS: ReadonlySet<MovementUnresolvedReason> = new Set<MovementUnresolvedReason>([
  "location_unknown",
  "sensitive_proximity",
  "api_timeout",
  "api_error",
  "rate_limit",
  "cost_cap_exceeded",
  "heuristic_failed",
  "no_provider_available",
]);

const VALID_RESOLVED_PROVIDERS: ReadonlySet<TransportProvider> = new Set<TransportProvider>([
  "google_routes",
  "heuristic_distance",
  "manual_user",
]);

/**
 * Resolved segment の 4 field 存在 + valid 値 を確認。
 *
 * Throws on:
 *   - estimatedDurationMin が NaN / Infinity / negative / 非 number
 *   - modeCandidate が missing
 *   - source が "none" / 不正値
 *   - confidence が missing
 */
function assertResolvedShape(segment: MovementSegmentResolved): void {
  // invariant 1: resolvedHasDuration
  if (
    typeof segment.estimatedDurationMin !== "number" ||
    !Number.isFinite(segment.estimatedDurationMin) ||
    segment.estimatedDurationMin < 0
  ) {
    throw new MovementSegmentIntegrityError(
      "resolvedHasDuration",
      segment,
      `estimatedDurationMin=${String(segment.estimatedDurationMin)}`,
    );
  }

  // invariant 2: resolvedHasMode
  if (!segment.modeCandidate || typeof segment.modeCandidate !== "object") {
    throw new MovementSegmentIntegrityError("resolvedHasMode", segment);
  }

  // invariant 3: resolvedHasSource (= "none" は禁止)
  // invariant 7: providerNoneOnlyUnresolved も同時にここで弾く
  if (!VALID_RESOLVED_PROVIDERS.has(segment.source)) {
    throw new MovementSegmentIntegrityError(
      "providerNoneOnlyUnresolved",
      segment,
      `source=${String(segment.source)} not allowed for resolved`,
    );
  }

  // invariant 4: resolvedHasConfidence
  if (!segment.confidence || typeof segment.confidence !== "object") {
    throw new MovementSegmentIntegrityError("resolvedHasConfidence", segment);
  }

  // invariant 6: sensitiveBothIsUnresolved
  if (segment.privacyClass === "sensitive_both") {
    throw new MovementSegmentIntegrityError(
      "sensitiveBothIsUnresolved",
      segment,
      `privacyClass=sensitive_both must remain unresolved (caller 責任)`,
    );
  }

  // invariant 8: locationUnknownIsUnresolved
  if (segment.privacyClass === "location_unknown") {
    throw new MovementSegmentIntegrityError(
      "locationUnknownIsUnresolved",
      segment,
      `privacyClass=location_unknown cannot be resolved`,
    );
  }
}

/**
 * Unresolved segment の reason 妥当性を確認。
 *
 * Throws on:
 *   - unresolvedReason が VALID_UNRESOLVED_REASONS に含まれない
 */
function assertUnresolvedShape(segment: MovementSegmentUnresolved): void {
  // invariant 5: unresolvedHasReason
  if (!VALID_UNRESOLVED_REASONS.has(segment.unresolvedReason)) {
    throw new MovementSegmentIntegrityError(
      "unresolvedHasReason",
      segment,
      `unresolvedReason=${String(segment.unresolvedReason)} invalid`,
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開 entry — assertMovementSegmentCompliance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Top-level assert。 全 invariant を順次 check し、 違反で
 * `MovementSegmentIntegrityError` を throw する。
 *
 * 使い方:
 *   - L-2 provider unit test で resolved 出力に対して呼ぶ
 *   - L-3+ で DayGraph 統合時に build pipeline で呼ぶ
 *
 * Side effect-free。 segment は frozen でなくても OK (= readonly 想定だが mutate しない)。
 */
export function assertMovementSegmentCompliance(segment: MovementSegment): void {
  if (segment.timingStatus === "resolved") {
    assertResolvedShape(segment);
    return;
  }
  if (segment.timingStatus === "unresolved") {
    assertUnresolvedShape(segment);
    return;
  }
  // discriminated union の網羅性が崩れた場合 (= 将来 status 拡張時の防御)
  const exhaustiveCheck: never = segment;
  throw new Error(
    `[L-1] Non-exhaustive MovementSegment timingStatus: ${JSON.stringify(
      exhaustiveCheck,
    )}`,
  );
}

/**
 * 配列を一括 verify。 違反は throw、 全 PASS なら void 返却。
 */
export function assertMovementSegmentsCompliance(
  segments: ReadonlyArray<MovementSegment>,
): void {
  for (const segment of segments) {
    assertMovementSegmentCompliance(segment);
  }
}
