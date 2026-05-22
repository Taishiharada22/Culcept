/**
 * Phase 3-L-4b (pure) — Movement Display Contract
 *
 * 役割:
 *   L-4a の出力 `MovementDisplayView` / `MovementDisplayResult` が **以下を満たす** ことを
 *   runtime に機械保証する assert 関数群。
 *
 *   1. PII (= raw locationText / title / userId / anchorId / nodeId) を含まない
 *   2. tier は `"tier_2_movement"` 固定
 *   3. variant は 3 値のいずれか
 *   4. NG 文言 (= recommendation / warning / optimization / mode / distance) を含まない
 *   5. displayText は OK 文言 list のいずれかに正確一致 (= 正規表現で構造保証)
 *   6. K-3c-iii 階層 2 規格を破壊しない
 *
 * 思想 (= L-3c structural privacy の継承):
 *   - type 経路を抜けた違反値を runtime で捕捉
 *   - 既存 K-3c-iii 階層を 1 ピクセルも侵さない
 *   - Aneurasync 思想に整合 (= Mobility Truth Layer は推奨 / 最適化を一切しない)
 *
 * L-4b-pure scope:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase 既存 file 変更 0
 *   - L-1 type 変更 0 (= freeze 維持)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-4-readiness-audit.md §3 / §5.2
 *   - lib/plan/transport/movementDisplayFormatter.ts (= L-4a)
 *   - lib/plan/dayGraph/dayGraphTimelinePresentation.ts (= K-3c-iii 階層 2)
 */

import type {
  MovementDisplayResult,
  MovementDisplayView,
} from "./movementDisplayFormatter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract 宣言 (= 不変条件の literal record)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 6 不変条件。 全 true (= literal type) で固定。
 */
export interface MovementDisplayContract {
  readonly noPiiInDisplayText: true;
  readonly noPiiInViewKeys: true;
  readonly tierIsTier2Movement: true;
  readonly variantIsOneOfThree: true;
  readonly noNgWordingInDisplayText: true;
  readonly displayTextMatchesOkPattern: true;
}

export const MOVEMENT_DISPLAY_CONTRACT: MovementDisplayContract = {
  noPiiInDisplayText: true,
  noPiiInViewKeys: true,
  tierIsTier2Movement: true,
  variantIsOneOfThree: true,
  noNgWordingInDisplayText: true,
  displayTextMatchesOkPattern: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class MovementDisplayContractError extends Error {
  readonly violation: keyof MovementDisplayContract;
  readonly viewSnapshot: Readonly<MovementDisplayView>;
  constructor(
    violation: keyof MovementDisplayContract,
    view: MovementDisplayView,
    detail?: string,
  ) {
    const suffix = detail ? ` (${detail})` : "";
    super(
      `[L-4b] MovementDisplayView violates ${violation}${suffix}. ` +
        `variant=${view.variant}, displayText="${view.displayText}"`,
    );
    this.name = "MovementDisplayContractError";
    this.violation = violation;
    this.viewSnapshot = view;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NG 文言 list (= regression guard、 readiness audit §3.2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * displayText に **絶対に含まれてはいけない** 文言。
 *
 * 含意:
 *   - recommendation / urgency (= 「早めに」「お急ぎ」「余裕」「急いで」)
 *   - optimization (= 「快適」「便利」「最適」)
 *   - warning (= 「注意」「警告」「危険」「リスク」「遅刻」)
 *   - mode 表示 (= 「歩いて」「車で」「電車で」「飛行機で」) — L-4a 範囲外
 *   - distance 表示 (= 「km」「メートル」) — L-4a で内部のみ
 *   - 英語 raw (= "from" / "to") — locationText 漏洩可能性
 */
const NG_WORDING_SUBSTRINGS: ReadonlyArray<string> = [
  // recommendation / urgency
  "早めに",
  "お急ぎ",
  "余裕",
  "急いで",
  // optimization
  "快適",
  "便利",
  "最適",
  // warning
  "注意",
  "警告",
  "危険",
  "リスク",
  "遅刻",
  // mode 表示
  "歩いて",
  "車で",
  "電車で",
  "飛行機で",
  "バスで",
  // distance 表示
  "km",
  "メートル",
  // 英語 raw (= location 漏洩可能性)
  "from",
  "to",
];

/**
 * displayText に存在することが許される文言の正規表現 (= 完全一致のいずれか):
 *   - "→ 移動"             (= unresolved)
 *   - "移動"                (= sensitive)
 *   - "移動 約 N 分"         (= duration_only、 N は 1 以上の整数)
 */
const OK_DISPLAY_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  /^→ 移動$/,
  /^移動$/,
  /^移動 約 \d+ 分$/,
];

const VALID_VARIANTS: ReadonlySet<MovementDisplayView["variant"]> = new Set([
  "unresolved",
  "sensitive",
  "duration_only",
]);

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
  "estimatedDurationMin", // raw duration 出さない、 text のみ
  "modeCandidate",         // raw mode 出さない
  "source",                // provider id 出さない
  "confidence",            // raw confidence 出さない、 band のみ
  "privacyClass",          // raw class 出さない
  "distanceM",             // 距離出さない
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 invariant check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkNoPiiInDisplayText(view: MovementDisplayView): void {
  // displayText に locationText / title 等 PII の literal が含まれることはあり得ないが、
  // OK pattern による完全一致で代用 (= 後段 checkDisplayTextOkPattern が真の防御)
  // 本 check はあくまで安全網として OK pattern と二重保証する。
  if (view.displayText.length === 0) {
    throw new MovementDisplayContractError(
      "noPiiInDisplayText",
      view,
      "displayText is empty",
    );
  }
}

function checkNoPiiInViewKeys(view: MovementDisplayView): void {
  const keys = Object.keys(view);
  for (const forbidden of FORBIDDEN_VIEW_KEYS) {
    if (keys.includes(forbidden)) {
      throw new MovementDisplayContractError(
        "noPiiInViewKeys",
        view,
        `key="${forbidden}" found`,
      );
    }
  }
}

function checkTierIsTier2Movement(view: MovementDisplayView): void {
  if (view.tier !== "tier_2_movement") {
    throw new MovementDisplayContractError(
      "tierIsTier2Movement",
      view,
      `tier=${String(view.tier)}`,
    );
  }
}

function checkVariantIsOneOfThree(view: MovementDisplayView): void {
  if (!VALID_VARIANTS.has(view.variant)) {
    throw new MovementDisplayContractError(
      "variantIsOneOfThree",
      view,
      `variant=${String(view.variant)}`,
    );
  }
}

function checkNoNgWordingInDisplayText(view: MovementDisplayView): void {
  for (const ng of NG_WORDING_SUBSTRINGS) {
    if (view.displayText.includes(ng)) {
      throw new MovementDisplayContractError(
        "noNgWordingInDisplayText",
        view,
        `NG substring="${ng}" found`,
      );
    }
  }
}

function checkDisplayTextMatchesOkPattern(view: MovementDisplayView): void {
  for (const pattern of OK_DISPLAY_TEXT_PATTERNS) {
    if (pattern.test(view.displayText)) return;
  }
  throw new MovementDisplayContractError(
    "displayTextMatchesOkPattern",
    view,
    `displayText "${view.displayText}" does not match any OK pattern`,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertMovementDisplayCompliance (= 単一 view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 MovementDisplayView を 6 不変条件に対して assertion する pure function。
 *
 * Side effect なし、 view を mutate しない。 全 invariant PASS なら void、
 * 違反検出時は `MovementDisplayContractError` を throw。
 */
export function assertMovementDisplayCompliance(view: MovementDisplayView): void {
  checkNoPiiInDisplayText(view);
  checkNoPiiInViewKeys(view);
  checkTierIsTier2Movement(view);
  checkVariantIsOneOfThree(view);
  checkNoNgWordingInDisplayText(view);
  checkDisplayTextMatchesOkPattern(view);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertMovementDisplayResultCompliance (= bulk)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * MovementDisplayResult の全 entry を assertion する。
 *
 * 追加 check:
 *   - displaysByTransitionKey の key 形式が `transition_${index}` (= L-3c 非 PII 形式)
 *   - variantCounts の和 === displaysByTransitionKey.size (= 集計恒等式)
 */
export function assertMovementDisplayResultCompliance(
  result: MovementDisplayResult,
): void {
  // top-level: key 形式 + 集計恒等式
  for (const key of result.displaysByTransitionKey.keys()) {
    if (!/^transition_\d+$/.test(key)) {
      throw new MovementDisplayContractError(
        "noPiiInViewKeys",
        // dummy view for snapshot
        { transitionIndex: -1, displayText: "", tier: "tier_2_movement", variant: "unresolved" },
        `transition_key_format_violation: "${key}"`,
      );
    }
  }
  const total =
    result.variantCounts.unresolved +
    result.variantCounts.sensitive +
    result.variantCounts.duration_only;
  if (total !== result.displaysByTransitionKey.size) {
    throw new MovementDisplayContractError(
      "variantIsOneOfThree",
      { transitionIndex: -1, displayText: "", tier: "tier_2_movement", variant: "unresolved" },
      `variantCounts sum ${total} != displaysByTransitionKey.size ${result.displaysByTransitionKey.size}`,
    );
  }

  // 各 view individually assert
  for (const view of result.displaysByTransitionKey.values()) {
    assertMovementDisplayCompliance(view);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const NG_WORDING_SUBSTRINGS_FOR_TEST = NG_WORDING_SUBSTRINGS;
export const OK_DISPLAY_TEXT_PATTERNS_FOR_TEST = OK_DISPLAY_TEXT_PATTERNS;
