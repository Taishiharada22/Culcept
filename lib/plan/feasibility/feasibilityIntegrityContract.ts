/**
 * Phase 3-M-1 (pure) — Feasibility Integrity Contract
 *
 * 役割:
 *   `FeasibilitySlackView` / `DayFeasibilityResult` が以下を満たすことを
 *   runtime に機械保証する assert 関数群。
 *
 *   6 不変条件:
 *     1. sufficientHasSlackMin:        sufficient → slackMin が finite non-negative number、 shortfallMin 不在
 *     2. insufficientHasShortfallMin:  insufficient → shortfallMin が finite positive number、 slackMin 不在
 *     3. notApplicableHasNoFields:      not_applicable → slackMin / shortfallMin 両方 undefined
 *     4. transitionIndexIsFinite:       transitionIndex は finite non-negative integer
 *     5. statusIsOneOfThree:             status は 3 値のいずれか
 *     6. noPiiInFeasibilityView:        view の key set に PII field 不在
 *
 *   + Result-level:
 *     7. transitionKeyFormatIsOrdinal:  feasibilityByTransitionKey の key は `transition_\d+$` 形式
 *     8. countsSumEqualsSize:           counts 和 === feasibilityByTransitionKey.size
 *     9. noPiiInResultTopLevel:         result top-level に PII field 不在
 *
 * 思想 (= L-4b と対称):
 *   - type system だけでは「sufficient なのに shortfallMin が設定されている」 等の cross-field 制約を表現できない
 *   - 機械保証で「型は通るが意味的に禁止」 を runtime で reject
 *   - L-3c assertOverlayResultCompliance / L-4b assertMovementDisplayResultCompliance と同 pattern
 *
 * M-1-pure scope:
 *   - LLM 不使用 / no DB / no API / no UI / no localStorage / no telemetry sink
 *   - K phase / L 既存 file 改変 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-readiness-audit.md §4.4
 *   - lib/plan/feasibility/feasibilityTypes.ts
 *   - lib/plan/transport/transportIntegrityContract.ts (= L-1、 同 pattern)
 *   - lib/plan/transport/movementDisplayContract.ts (= L-4b、 同 pattern)
 */

import type {
  DayFeasibilityResult,
  FeasibilitySlackView,
  SlackStatus,
} from "./feasibilityTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract 宣言 (= 9 不変条件の literal record)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FeasibilityIntegrityContract {
  readonly sufficientHasSlackMin: true;
  readonly insufficientHasShortfallMin: true;
  readonly notApplicableHasNoFields: true;
  readonly transitionIndexIsFinite: true;
  readonly statusIsOneOfThree: true;
  readonly noPiiInFeasibilityView: true;
  readonly transitionKeyFormatIsOrdinal: true;
  readonly countsSumEqualsSize: true;
  readonly noPiiInResultTopLevel: true;
}

export const FEASIBILITY_INTEGRITY_CONTRACT: FeasibilityIntegrityContract = {
  sufficientHasSlackMin: true,
  insufficientHasShortfallMin: true,
  notApplicableHasNoFields: true,
  transitionIndexIsFinite: true,
  statusIsOneOfThree: true,
  noPiiInFeasibilityView: true,
  transitionKeyFormatIsOrdinal: true,
  countsSumEqualsSize: true,
  noPiiInResultTopLevel: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class FeasibilityIntegrityError extends Error {
  readonly violation: keyof FeasibilityIntegrityContract;
  readonly viewSnapshot?: Readonly<FeasibilitySlackView>;
  constructor(
    violation: keyof FeasibilityIntegrityContract,
    detail?: string,
    viewSnapshot?: FeasibilitySlackView,
  ) {
    const suffix = detail ? ` (${detail})` : "";
    super(`[M-1] Feasibility violates ${violation}${suffix}`);
    this.name = "FeasibilityIntegrityError";
    this.violation = violation;
    if (viewSnapshot) this.viewSnapshot = viewSnapshot;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Forbidden keys (= PII grep guard、 L-4b と同 list)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FORBIDDEN_VIEW_KEYS: ReadonlyArray<string> = [
  "fromNodeId",
  "toNodeId",
  "fromLocationText",
  "toLocationText",
  "sensitiveProximity",
  "anchorId",
  "userId",
  "title",
  "locationText",
  // 数値系 raw (= L-4b と同様、 一部の M 専用 field 以外は禁止)
  "estimatedDurationMin",     // L-3c sanitize 対象、 M でも表示しない
  "distanceM",                 // L-3c sanitize 対象
  "modeCandidate",             // L-4 範囲外
  "source",                    // provider id 出さない
  "privacyClass",              // raw class 出さない
];

const FORBIDDEN_RESULT_TOP_KEYS: ReadonlyArray<string> = [
  ...FORBIDDEN_VIEW_KEYS,
  // result-level の追加 PII guard
  "tracingId",                // L overlay の tracingId は M でも露出しない
];

const VALID_STATUSES: ReadonlySet<SlackStatus> = new Set<SlackStatus>([
  "sufficient",
  "insufficient",
  "not_applicable",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 invariant check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkStatusIsOneOfThree(view: FeasibilitySlackView): void {
  if (!VALID_STATUSES.has(view.status)) {
    throw new FeasibilityIntegrityError(
      "statusIsOneOfThree",
      `status=${String(view.status)}`,
      view,
    );
  }
}

function checkTransitionIndexIsFinite(view: FeasibilitySlackView): void {
  if (
    typeof view.transitionIndex !== "number" ||
    !Number.isFinite(view.transitionIndex) ||
    !Number.isInteger(view.transitionIndex) ||
    view.transitionIndex < 0
  ) {
    throw new FeasibilityIntegrityError(
      "transitionIndexIsFinite",
      `transitionIndex=${String(view.transitionIndex)}`,
      view,
    );
  }
}

function checkSufficientShape(view: FeasibilitySlackView): void {
  if (view.status !== "sufficient") return;
  // sufficient → slackMin が finite non-negative number
  if (
    typeof view.slackMin !== "number" ||
    !Number.isFinite(view.slackMin) ||
    view.slackMin < 0
  ) {
    throw new FeasibilityIntegrityError(
      "sufficientHasSlackMin",
      `slackMin=${String(view.slackMin)}`,
      view,
    );
  }
  // sufficient → shortfallMin 不在
  if (view.shortfallMin !== undefined) {
    throw new FeasibilityIntegrityError(
      "sufficientHasSlackMin",
      `shortfallMin should be undefined for sufficient, got ${String(view.shortfallMin)}`,
      view,
    );
  }
}

function checkInsufficientShape(view: FeasibilitySlackView): void {
  if (view.status !== "insufficient") return;
  // insufficient → shortfallMin が finite positive number
  if (
    typeof view.shortfallMin !== "number" ||
    !Number.isFinite(view.shortfallMin) ||
    view.shortfallMin <= 0
  ) {
    throw new FeasibilityIntegrityError(
      "insufficientHasShortfallMin",
      `shortfallMin=${String(view.shortfallMin)}`,
      view,
    );
  }
  // insufficient → slackMin 不在
  if (view.slackMin !== undefined) {
    throw new FeasibilityIntegrityError(
      "insufficientHasShortfallMin",
      `slackMin should be undefined for insufficient, got ${String(view.slackMin)}`,
      view,
    );
  }
}

function checkNotApplicableShape(view: FeasibilitySlackView): void {
  if (view.status !== "not_applicable") return;
  // not_applicable → slackMin / shortfallMin 両方 undefined
  if (view.slackMin !== undefined) {
    throw new FeasibilityIntegrityError(
      "notApplicableHasNoFields",
      `slackMin should be undefined for not_applicable, got ${String(view.slackMin)}`,
      view,
    );
  }
  if (view.shortfallMin !== undefined) {
    throw new FeasibilityIntegrityError(
      "notApplicableHasNoFields",
      `shortfallMin should be undefined for not_applicable, got ${String(view.shortfallMin)}`,
      view,
    );
  }
}

function checkNoPiiInView(view: FeasibilitySlackView): void {
  const keys = Object.keys(view);
  for (const forbidden of FORBIDDEN_VIEW_KEYS) {
    if (keys.includes(forbidden)) {
      throw new FeasibilityIntegrityError(
        "noPiiInFeasibilityView",
        `key="${forbidden}" found`,
        view,
      );
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertFeasibilityCompliance (= 単一 view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 FeasibilitySlackView を 6 invariants に対して assertion する pure function。
 *
 * 副作用なし、 view を mutate しない。 全 invariant PASS なら void、
 * 違反検出時は `FeasibilityIntegrityError` を throw。
 */
export function assertFeasibilityCompliance(view: FeasibilitySlackView): void {
  checkStatusIsOneOfThree(view);
  checkTransitionIndexIsFinite(view);
  checkSufficientShape(view);
  checkInsufficientShape(view);
  checkNotApplicableShape(view);
  checkNoPiiInView(view);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertDayFeasibilityResultCompliance (= bulk)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayFeasibilityResult の全 entry を assertion する。
 *
 * 追加 check:
 *   - top-level field に PII 不在
 *   - feasibilityByTransitionKey の key 形式が `transition_${index}` (= L-3c 非 PII 形式継承)
 *   - counts の和 === feasibilityByTransitionKey.size (= 集計恒等式)
 *   - 各 FeasibilitySlackView の個別 assertion
 */
export function assertDayFeasibilityResultCompliance(
  result: DayFeasibilityResult,
): void {
  // (1) top-level PII guard
  const topKeys = Object.keys(result);
  for (const forbidden of FORBIDDEN_RESULT_TOP_KEYS) {
    if (topKeys.includes(forbidden)) {
      throw new FeasibilityIntegrityError(
        "noPiiInResultTopLevel",
        `key="${forbidden}" found in result top-level`,
      );
    }
  }

  // (2) transitionKey 形式 (= L-3c `transition_${index}` 継承)
  for (const key of result.feasibilityByTransitionKey.keys()) {
    if (!/^transition_\d+$/.test(key)) {
      throw new FeasibilityIntegrityError(
        "transitionKeyFormatIsOrdinal",
        `key="${key}" does not match /^transition_\\d+$/`,
      );
    }
  }

  // (3) 集計恒等式
  const total =
    result.counts.sufficient +
    result.counts.insufficient +
    result.counts.notApplicable;
  if (total !== result.feasibilityByTransitionKey.size) {
    throw new FeasibilityIntegrityError(
      "countsSumEqualsSize",
      `counts sum ${total} != size ${result.feasibilityByTransitionKey.size}`,
    );
  }

  // (4) 各 view individually
  for (const view of result.feasibilityByTransitionKey.values()) {
    assertFeasibilityCompliance(view);
  }
}
