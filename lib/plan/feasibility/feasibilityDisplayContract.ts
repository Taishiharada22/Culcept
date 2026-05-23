/**
 * Phase 3-M-2b (pure) — Feasibility Display Contract
 *
 * 役割:
 *   M-2a の `formatFeasibilityForDisplay` 出力 が以下を満たすことを runtime に機械保証する
 *   assert 関数群。 「不足を警告に見せない」 設計の 3 重防御を構造で保証。
 *
 *   6 不変条件:
 *     1. noPiiInDisplayText:           displayText が空ではなく、 PII を含まない
 *     2. noPiiInViewKeys:               view の key set に 16 forbidden keys 不在
 *     3. tierIsTier2MovementAux:        tier は "tier_2_movement_aux" 固定
 *     4. variantIsOneOfTwo:              variant は "slack" / "shortfall" のいずれか
 *     5. noNgWordingInDisplayText:      displayText に NG 文言 (= 30+ substring) 不在
 *     6. displayTextMatchesOkPattern:   displayText は 2 OK 正規表現のいずれかに完全一致
 *
 *   + Result-level:
 *     7. transitionKeyFormatIsOrdinal:  feasibilityDisplayByTransitionKey の key は `transition_\d+$`
 *     8. countsSumEqualsSize:           counts 和 === feasibilityDisplayByTransitionKey.size
 *     9. noPiiInResultTopLevel:         result top-level に PII 不在
 *
 * 思想 (= L-4b と対称、 「不足を警告に見せない」 機械保証):
 *   - 警告化要素 5 dimension 全件防御
 *   - 文言 / 視覚 / 構造 の 3 重防御を contract で機械保証
 *
 * M-2b-pure scope:
 *   - LLM 不使用 / API 不使用 / no DB / no UI / no localStorage / no telemetry sink
 *   - K phase / L / M-1 既存 file 改変 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-2-readiness-audit.md §3 / §7.2
 *   - lib/plan/feasibility/feasibilityDisplayFormatter.ts (= M-2a)
 *   - lib/plan/transport/movementDisplayContract.ts (= L-4b、 対称 pattern)
 */

import type {
  FeasibilityDisplayResult,
  FeasibilityDisplayView,
  FeasibilityDisplayVariant,
} from "./feasibilityDisplayFormatter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract 宣言 (= 9 不変条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FeasibilityDisplayContract {
  readonly noPiiInDisplayText: true;
  readonly noPiiInViewKeys: true;
  readonly tierIsTier2MovementAux: true;
  readonly variantIsOneOfTwo: true;
  readonly noNgWordingInDisplayText: true;
  readonly displayTextMatchesOkPattern: true;
  readonly transitionKeyFormatIsOrdinal: true;
  readonly countsSumEqualsSize: true;
  readonly noPiiInResultTopLevel: true;
}

export const FEASIBILITY_DISPLAY_CONTRACT: FeasibilityDisplayContract = {
  noPiiInDisplayText: true,
  noPiiInViewKeys: true,
  tierIsTier2MovementAux: true,
  variantIsOneOfTwo: true,
  noNgWordingInDisplayText: true,
  displayTextMatchesOkPattern: true,
  transitionKeyFormatIsOrdinal: true,
  countsSumEqualsSize: true,
  noPiiInResultTopLevel: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error class
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class FeasibilityDisplayContractError extends Error {
  readonly violation: keyof FeasibilityDisplayContract;
  readonly viewSnapshot?: Readonly<FeasibilityDisplayView>;
  constructor(
    violation: keyof FeasibilityDisplayContract,
    detail?: string,
    view?: FeasibilityDisplayView,
  ) {
    const suffix = detail ? ` (${detail})` : "";
    super(
      `[M-2b] FeasibilityDisplay violates ${violation}${suffix}` +
        (view ? ` (variant=${view.variant}, displayText="${view.displayText}")` : ""),
    );
    this.name = "FeasibilityDisplayContractError";
    this.violation = violation;
    if (view) this.viewSnapshot = view;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NG 文言 list (= 拡張、 readiness audit §3.2、 「不足を警告に見せない」)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * displayText に **絶対に含まれてはいけない** 文言 (= readiness audit §3.2)。
 *
 * 5 dimension 全件防御:
 *   - 形容詞 / 質的評価 — 「ギリギリ」 「快適」 「便利」 等
 *   - 警告 / 注意 — 「危険」 「リスク」 「警告」 等
 *   - 緊急感 — 「急いで」 「早めに」 「あと N 分」 「もう少し」 等
 *   - 推奨 / 推測 — 「おすすめ」 「推奨」 「予測」 等
 *   - 相対表現 — 「足りない」 「余る」 「ピッタリ」 等
 *   - 記号 — ⚠️ / ❗ / ❌ / ‼ / 半角 ! / 半角 ? / 全角 ！ / 全角 ？
 *   - 外国語 — "warning" / "alert" / "OK" 等
 *   - 動詞命令 — 「急いで」 等
 */
const NG_WORDING_SUBSTRINGS: ReadonlyArray<string> = [
  // === M-1 audit で既に列挙 ===
  // 形容詞 / 質的評価
  "ギリギリ",
  "余裕",
  "快適",
  "便利",
  "最適",
  // 警告 / 注意
  "注意",
  "警告",
  "危険",
  "リスク",
  "遅刻",
  // 緊急感
  "急いで",
  "お急ぎ",
  "早めに",

  // === M-2 audit で新規追加 ===
  // 推測 / 警告に近接
  "間に合わない",
  "おすすめ",
  "推奨",
  "提案",
  "推測",
  "予測",
  "予想",
  // 緊急感
  "あと ",          // 「あと N 分」 等
  "もう少し",
  // 相対表現 (= 「余白 / 不足」 厳守)
  "足りない",
  "余る",
  // 質的評価
  "ピッタリ",
  "ちょうど",
  // 記号 — 警告的
  "⚠",
  "❗",
  "❌",
  "‼",
  "！",            // 全角 !
  "？",            // 全角 ?
  // 外国語 / 警告
  "Achtung",
  "warning",
  "alert",
  "Warning",
  "Alert",
  "WARNING",
  "ALERT",
  // 肯定強調 (= 中立から外れる)
  "OK",
  // 半角 ! / ? は displayText に含まれない (= OK pattern が「余白 N 分」 「不足 N 分」 のみで `!?` は出ない)
  // 但し追加防御:
  "!",             // 半角 !
  "?",             // 半角 ?
];

/**
 * displayText に存在することが許される文言の正規表現 (= 完全一致のいずれか):
 *   - "余白 N 分" (= sufficient → variant "slack")
 *   - "不足 N 分" (= insufficient → variant "shortfall")
 *
 * N は 0 以上の整数 (= sufficient slackMin>=0、 insufficient shortfallMin>0)。
 */
const OK_DISPLAY_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  /^余白 \d+ 分$/,
  /^不足 \d+ 分$/,
];

const VALID_VARIANTS: ReadonlySet<FeasibilityDisplayVariant> = new Set<FeasibilityDisplayVariant>([
  "slack",
  "shortfall",
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
  // raw 数値 (= M-1 内部 field を表示層に持ち出さない、 L-3c sanitize 思想継承)
  "slackMin",
  "shortfallMin",
  "estimatedDurationMin",
  "distanceM",
  "modeCandidate",
  "source",
  "privacyClass",
];

const FORBIDDEN_RESULT_TOP_KEYS: ReadonlyArray<string> = [
  ...FORBIDDEN_VIEW_KEYS,
  "tracingId",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 invariant check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkNoPiiInDisplayText(view: FeasibilityDisplayView): void {
  if (typeof view.displayText !== "string" || view.displayText.length === 0) {
    throw new FeasibilityDisplayContractError(
      "noPiiInDisplayText",
      "displayText is empty / non-string",
      view,
    );
  }
}

function checkNoPiiInViewKeys(view: FeasibilityDisplayView): void {
  const keys = Object.keys(view);
  for (const forbidden of FORBIDDEN_VIEW_KEYS) {
    if (keys.includes(forbidden)) {
      throw new FeasibilityDisplayContractError(
        "noPiiInViewKeys",
        `key="${forbidden}" found`,
        view,
      );
    }
  }
}

function checkTierIsTier2MovementAux(view: FeasibilityDisplayView): void {
  if (view.tier !== "tier_2_movement_aux") {
    throw new FeasibilityDisplayContractError(
      "tierIsTier2MovementAux",
      `tier=${String(view.tier)}`,
      view,
    );
  }
}

function checkVariantIsOneOfTwo(view: FeasibilityDisplayView): void {
  if (!VALID_VARIANTS.has(view.variant)) {
    throw new FeasibilityDisplayContractError(
      "variantIsOneOfTwo",
      `variant=${String(view.variant)}`,
      view,
    );
  }
}

function checkNoNgWordingInDisplayText(view: FeasibilityDisplayView): void {
  for (const ng of NG_WORDING_SUBSTRINGS) {
    if (view.displayText.includes(ng)) {
      throw new FeasibilityDisplayContractError(
        "noNgWordingInDisplayText",
        `NG substring="${ng}" found`,
        view,
      );
    }
  }
}

function checkDisplayTextMatchesOkPattern(view: FeasibilityDisplayView): void {
  for (const pattern of OK_DISPLAY_TEXT_PATTERNS) {
    if (pattern.test(view.displayText)) return;
  }
  throw new FeasibilityDisplayContractError(
    "displayTextMatchesOkPattern",
    `displayText "${view.displayText}" does not match any OK pattern`,
    view,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertFeasibilityDisplayCompliance (= 単一 view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 FeasibilityDisplayView を 6 invariants に対して assertion する pure function。
 *
 * 副作用なし、 view を mutate しない。 全 invariant PASS なら void、
 * 違反検出時は `FeasibilityDisplayContractError` を throw。
 */
export function assertFeasibilityDisplayCompliance(
  view: FeasibilityDisplayView,
): void {
  checkNoPiiInDisplayText(view);
  checkNoPiiInViewKeys(view);
  checkTierIsTier2MovementAux(view);
  checkVariantIsOneOfTwo(view);
  checkNoNgWordingInDisplayText(view);
  checkDisplayTextMatchesOkPattern(view);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: assertFeasibilityDisplayResultCompliance (= bulk)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * FeasibilityDisplayResult の全 entry を assertion する。
 *
 * 追加 check:
 *   - top-level field に PII 不在
 *   - feasibilityDisplayByTransitionKey の key 形式が `transition_${index}`
 *   - counts の和 === feasibilityDisplayByTransitionKey.size (= 集計恒等式)
 *   - 各 FeasibilityDisplayView の個別 assertion
 */
export function assertFeasibilityDisplayResultCompliance(
  result: FeasibilityDisplayResult,
): void {
  // (1) top-level PII guard
  const topKeys = Object.keys(result);
  for (const forbidden of FORBIDDEN_RESULT_TOP_KEYS) {
    if (topKeys.includes(forbidden)) {
      throw new FeasibilityDisplayContractError(
        "noPiiInResultTopLevel",
        `key="${forbidden}" found in result top-level`,
      );
    }
  }

  // (2) transitionKey 形式 (= L-3c `transition_${index}` 継承)
  for (const key of result.feasibilityDisplayByTransitionKey.keys()) {
    if (!/^transition_\d+$/.test(key)) {
      throw new FeasibilityDisplayContractError(
        "transitionKeyFormatIsOrdinal",
        `key="${key}" does not match /^transition_\\d+$/`,
      );
    }
  }

  // (3) 集計恒等式
  const total = result.counts.slack + result.counts.shortfall;
  if (total !== result.feasibilityDisplayByTransitionKey.size) {
    throw new FeasibilityDisplayContractError(
      "countsSumEqualsSize",
      `counts sum ${total} != size ${result.feasibilityDisplayByTransitionKey.size}`,
    );
  }

  // (4) 各 view individually
  for (const view of result.feasibilityDisplayByTransitionKey.values()) {
    assertFeasibilityDisplayCompliance(view);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports (= test 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const NG_WORDING_SUBSTRINGS_FOR_TEST = NG_WORDING_SUBSTRINGS;
export const OK_DISPLAY_TEXT_PATTERNS_FOR_TEST = OK_DISPLAY_TEXT_PATTERNS;
export const FORBIDDEN_VIEW_KEYS_FOR_TEST = FORBIDDEN_VIEW_KEYS;
